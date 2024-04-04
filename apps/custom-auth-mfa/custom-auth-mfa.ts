// custom-auth-mfa.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ses from "aws-cdk-lib/aws-ses";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const senderEmail = "hryssmz@gmail.com";
    const recipientEmail = "hryssmz@yahoo.com";

    // Create SES resources
    const configurationSet = new ses.ConfigurationSet(
      this,
      "ConfigurationSet",
      {
        configurationSetName: `${this.stackName}-ConfigurationSet`,
        suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
        reputationMetrics: true,
      }
    );
    const senderIdentity = new ses.EmailIdentity(this, "SenderIdentity", {
      identity: ses.Identity.email(senderEmail),
      configurationSet,
    });
    const recipientIdentity = new ses.EmailIdentity(this, "RecipientIdentity", {
      identity: ses.Identity.email(recipientEmail),
      configurationSet,
    });
    const sendEmailPolicyStatement = new iam.PolicyStatement({
      actions: ["ses:SendEmail"],
      resources: [
        `arn:${this.partition}:ses:${this.region}:${this.account}:identity/${senderIdentity.emailIdentityName}`,
        `arn:${this.partition}:ses:${this.region}:${this.account}:identity/${recipientIdentity.emailIdentityName}`,
        `arn:${this.partition}:ses:${this.region}:${this.account}:configuration-set/${configurationSet.configurationSetName}`,
      ],
    });

    // Create Lambda triggers
    const defineAuthChallengeLogGroup = new logs.LogGroup(
      this,
      "DefineAuthChallengeLogGroup",
      {
        logGroupName: `/aws/lambda/${this.stackName}-DefineAuthChallengeFunction`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    const defineAuthChallengeFunction = new nodejs.NodejsFunction(
      this,
      "DefineAuthChallengeFunction",
      {
        functionName: `${this.stackName}-DefineAuthChallengeFunction`,
        description: `${this.stackName} define auth challenge function`,
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(28),
        logGroup: defineAuthChallengeLogGroup,
        environment: { key: "value" },
        entry: "src/define-auth-challenge.ts",
      }
    );

    const createAuthChallengeLogGroup = new logs.LogGroup(
      this,
      "CreateAuthChallengeLogGroup",
      {
        logGroupName: `/aws/lambda/${this.stackName}-CreateAuthChallengeFunction`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    const createAuthChallengeFunction = new nodejs.NodejsFunction(
      this,
      "CreateAuthChallengeFunction",
      {
        functionName: `${this.stackName}-CreateAuthChallengeFunction`,
        description: `${this.stackName} create auth challenge function`,
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(28),
        logGroup: createAuthChallengeLogGroup,
        environment: { SENDER_EMAIL: senderIdentity.emailIdentityName },
        entry: "src/create-auth-challenge.ts",
      }
    );
    createAuthChallengeFunction.addToRolePolicy(sendEmailPolicyStatement);

    const verifyAuthChallengeResponseLogGroup = new logs.LogGroup(
      this,
      "VerifyAuthChallengeResponseLogGroup",
      {
        logGroupName: `/aws/lambda/${this.stackName}-VerifyAuthChallengeResponseFunction`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    const verifyAuthChallengeResponseFunction = new nodejs.NodejsFunction(
      this,
      "VerifyAuthChallengeResponseFunction",
      {
        functionName: `${this.stackName}-VerifyAuthChallengeResponseFunction`,
        description: `${this.stackName} verify auth challenge response function`,
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(28),
        logGroup: verifyAuthChallengeResponseLogGroup,
        environment: { key: "value" },
        entry: "src/verify-auth-challenge-response.ts",
      }
    );

    // Create S3 bucket
    const bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `${this.stackName.toLowerCase()}-bucket-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new s3deploy.BucketDeployment(this, "BucketDeployment", {
      sources: [s3deploy.Source.asset("./react/dist")],
      destinationBucket: bucket,
      destinationKeyPrefix: "",
    });

    // Create CloudFront distribution
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "CloudFront distribution",
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      defaultRootObject: "index.html",
    });

    // Create Cognito user pool
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${this.stackName}-UserPool`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      signInCaseSensitive: false,
      passwordPolicy: {
        minLength: 6,
        requireDigits: false,
        requireLowercase: false,
        requireSymbols: false,
        requireUppercase: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      signInAliases: { username: true },
      autoVerify: { email: true },
      keepOriginal: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      customAttributes: {
        mfa: new cognito.StringAttribute({ mutable: true }),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      selfSignUpEnabled: true,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
        emailSubject: "User verification",
        emailBody: "Your verification code is {####}",
        smsMessage: "Your verification code is {####}",
      },
      userInvitation: {
        emailSubject: "User invitation",
        emailBody: "Hello {username}, your temporary password is {####}",
        smsMessage: "Hi {username}, your temporary password is {####}",
      },
      mfaMessage: "Hi, your authentication code is {####}",
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: true, otp: true },
      lambdaTriggers: {
        defineAuthChallenge: defineAuthChallengeFunction,
        createAuthChallenge: createAuthChallengeFunction,
        verifyAuthChallengeResponse: verifyAuthChallengeResponseFunction,
      },
    });

    // Create Cognito app client
    const userPoolClient = userPool.addClient("UserPoolClient", {
      userPoolClientName: `${this.stackName}-UserPoolClient`,
      authFlows: { userSrp: true, adminUserPassword: true, custom: true },
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          phoneNumber: true,
          phoneNumberVerified: true,
        })
        .withCustomAttributes("mfa"),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, phoneNumber: true })
        .withCustomAttributes("mfa"),
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      authSessionValidity: cdk.Duration.minutes(15),
      accessTokenValidity: cdk.Duration.days(1),
      idTokenValidity: cdk.Duration.days(1),
      refreshTokenValidity: cdk.Duration.days(10),
      enableTokenRevocation: true,
    });

    // Create admin Lambda functions
    const adminCreateUserLogGroup = new logs.LogGroup(
      this,
      "AdminCreateUserLogGroup",
      {
        logGroupName: `/aws/lambda/${this.stackName}-AdminCreateUserFunction`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    const adminCreateUserFunction = new nodejs.NodejsFunction(
      this,
      "AdminCreateUserFunction",
      {
        functionName: `${this.stackName}-AdminCreateUserFunction`,
        description: `${this.stackName} admin create user function`,
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(28),
        logGroup: adminCreateUserLogGroup,
        environment: { USER_POOL_ID: userPool.userPoolId },
        entry: "src/admin-create-user.ts",
      }
    );
    userPool.grant(adminCreateUserFunction, "cognito-idp:Admin*");

    // Outputs
    new cdk.CfnOutput(this, "DistributionURL", {
      description: "Distribution URL",
      value: `http://${distribution.domainName}`,
    });
    new cdk.CfnOutput(this, "UserPoolId", {
      description: "User pool ID",
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      description: "User pool client ID",
      value: userPoolClient.userPoolClientId,
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "custom-auth-mfa" });
