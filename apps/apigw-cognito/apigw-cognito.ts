// apigw-cognito.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
      autoVerify: { email: true, phone: true },
      keepOriginal: { email: true, phone: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      accountRecovery: cognito.AccountRecovery.PHONE_WITHOUT_MFA_AND_EMAIL,
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
    });

    // Create Cognito app client
    const userPoolClient = userPool.addClient("UserPoolClient", {
      userPoolClientName: `${this.stackName}-UserPoolClient`,
      authFlows: { userPassword: true, adminUserPassword: true },
      generateSecret: true,
      readAttributes: new cognito.ClientAttributes().withStandardAttributes({
        email: true,
        emailVerified: true,
        phoneNumber: true,
        phoneNumberVerified: true,
      }),
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({
        email: true,
        phoneNumber: true,
      }),
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
    new cdk.CfnOutput(this, "UserPoolClientSecret", {
      description: "Generated user pool client secret",
      value: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
    });

    // Create Lambda functions
    const signUpLogGroup = new logs.LogGroup(this, "SignUpLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-SignUpFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    new lambda.Function(this, "SignUpFunction", {
      functionName: `${this.stackName}-SignUpFunction`,
      description: `${this.stackName} signup function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      logGroup: signUpLogGroup,
      environment: {
        CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_HOST: `cognito-idp.${this.region}.${this.urlSuffix}`,
        CLIENT_SECRET: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      },
      code: lambda.Code.fromInline(`
        const crypto = require("node:crypto");
        const https = require("node:https");

        exports.handler = async event => {
          const { username, password, email, phoneNumber } = event;
          const clientId = process.env.CLIENT_ID;
          const hostname = process.env.COGNITO_HOST;
          const clientSecret = process.env.CLIENT_SECRET;
          const secretHash = crypto
            .createHmac("sha256", clientSecret)
            .update(username + clientId)
            .digest("base64");
          const userAttributes = [];
          if (phoneNumber !== undefined) {
            userAttributes.push({ Name: "phone_number", Value: phoneNumber });
          }
          if (email !== undefined) {
            userAttributes.push({ Name: "email", Value: email });
          }
          const reqBody = {
            ClientId: clientId,
            Username: username,
            Password: password,
            SecretHash: secretHash,
            UserAttributes: userAttributes,
          };
          const headers = {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.SignUp",
          };
          const response = await new Promise((resolve, reject) => {
            const req = https.request(
              { hostname, port: 443, path: "/", method: "POST", headers },
              res => {
                res.on("data", chunk => {
                  const resBody = JSON.parse(chunk.toString());
                  resolve(resBody);
                });
              }
            );
            req.on("error", e => {
              reject(e.message);
            });
            req.write(JSON.stringify(reqBody, null, 2));
            req.end();
          });

          return response;
        };
      `),
    });

    const confirmSignUpLogGroup = new logs.LogGroup(
      this,
      "ConfirmSignUpLogGroup",
      {
        logGroupName: `/aws/lambda/${this.stackName}-ConfirmSignUpFunction`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    new lambda.Function(this, "ConfirmSignUpFunction", {
      functionName: `${this.stackName}-ConfirmSignUpFunction`,
      description: `${this.stackName} confirm signup function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      logGroup: confirmSignUpLogGroup,
      environment: {
        CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_HOST: `cognito-idp.${this.region}.${this.urlSuffix}`,
        CLIENT_SECRET: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      },
      code: lambda.Code.fromInline(`
        const crypto = require("node:crypto");
        const https = require("node:https");

        exports.handler = async event => {
          const { username, code } = event;
          const clientId = process.env.CLIENT_ID;
          const hostname = process.env.COGNITO_HOST;
          const clientSecret = process.env.CLIENT_SECRET;
          const secretHash = crypto
            .createHmac("sha256", clientSecret)
            .update(username + clientId)
            .digest("base64");
          const reqBody = {
            ClientId: clientId,
            Username: username,
            SecretHash: secretHash,
            ConfirmationCode: code,
          };
          const headers = {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.ConfirmSignUp",
          };
          const response = await new Promise((resolve, reject) => {
            const req = https.request(
              { hostname, port: 443, path: "/", method: "POST", headers },
              res => {
                res.on("data", chunk => {
                  const resBody = JSON.parse(chunk.toString());
                  resolve(resBody);
                });
              }
            );
            req.on("error", e => {
              reject(e.message);
            });
            req.write(JSON.stringify(reqBody, null, 2));
            req.end();
          });

          return response;
        };
      `),
    });

    const signInLogGroup = new logs.LogGroup(this, "SignInLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-SignInFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    new lambda.Function(this, "SignInFunction", {
      functionName: `${this.stackName}-SignInFunction`,
      description: `${this.stackName} signin function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      logGroup: signInLogGroup,
      environment: {
        CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_HOST: `cognito-idp.${this.region}.${this.urlSuffix}`,
        CLIENT_SECRET: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      },
      code: lambda.Code.fromInline(`
        const crypto = require("node:crypto");
        const https = require("node:https");

        exports.handler = async event => {
          const { username, password } = event;
          const clientId = process.env.CLIENT_ID;
          const hostname = process.env.COGNITO_HOST;
          const clientSecret = process.env.CLIENT_SECRET;
          const secretHash = crypto
            .createHmac("sha256", clientSecret)
            .update(username + clientId)
            .digest("base64");
          const reqBody = {
            ClientId: clientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: {
              USERNAME: username,
              PASSWORD: password,
              SECRET_HASH: secretHash,
            },
          };
          const headers = {
            "Content-Type": "application/x-amz-json-1.1",
            "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
          };
          const { AuthenticationResult } = await new Promise((resolve, reject) => {
            const req = https.request(
              { hostname, port: 443, path: "/", method: "POST", headers },
              res => {
                res.on("data", chunk => {
                  const resBody = JSON.parse(chunk.toString());
                  resolve(resBody);
                });
              }
            );
            req.on("error", e => {
              reject(e.message);
            });
            req.write(JSON.stringify(reqBody, null, 2));
            req.end();
          });

          const accessToken = AuthenticationResult?.AccessToken;
          const idToken = AuthenticationResult?.IdToken;

          if (accessToken !== undefined) {
            const payload = Buffer.from(accessToken.split(".")[1], "base64").toString();
            console.log(JSON.stringify(JSON.parse(payload), null, 2));
          }

          if (idToken !== undefined) {
            const payload = Buffer.from(idToken.split(".")[1], "base64").toString();
            console.log(JSON.stringify(JSON.parse(payload), null, 2));
          }

          return AuthenticationResult;
        };
      `),
    });

    const createUserLogGroup = new logs.LogGroup(this, "CreateUserLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-CreateUserFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const createUserFunction = new lambda.Function(this, "CreateUserFunction", {
      functionName: `${this.stackName}-CreateUserFunction`,
      description: `${this.stackName} create user function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      logGroup: createUserLogGroup,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
        CLIENT_SECRET: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      },
      code: lambda.Code.fromInline(`
        const crypto = require("node:crypto");
        const {
          AdminCreateUserCommand,
          AdminInitiateAuthCommand,
          AdminRespondToAuthChallengeCommand,
          CognitoIdentityProviderClient,
        } = require("@aws-sdk/client-cognito-identity-provider");

        exports.handler = async event => {
          const { username, password, email, phoneNumber } = event;
          const userPoolId = process.env.USER_POOL_ID;
          const clientId = process.env.CLIENT_ID;
          const client = new CognitoIdentityProviderClient();
          const userAttributes = [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
          ];
          const desiredDeliveryMediums = ["EMAIL"];
          if (phoneNumber !== undefined) {
            userAttributes.push(
              { Name: "phone_number", Value: phoneNumber },
              { Name: "phone_number_verified", Value: "true" }
            );
            desiredDeliveryMediums.push("SMS");
          }

          const adminCreateUserCommand = new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: username,
            UserAttributes: userAttributes,
            TemporaryPassword: "temp-" + password,
            DesiredDeliveryMediums: desiredDeliveryMediums,
          });
          await client.send(adminCreateUserCommand);

          const clientSecret = process.env.CLIENT_SECRET;
          const secretHash = crypto
            .createHmac("sha256", clientSecret)
            .update(username + clientId)
            .digest("base64");
          const adminInitiateAuthCommand = new AdminInitiateAuthCommand({
            UserPoolId: userPoolId,
            ClientId: clientId,
            AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
            AuthParameters: {
              USERNAME: username,
              PASSWORD: "temp-" + password,
              SECRET_HASH: secretHash,
            },
          });
          const { Session, ChallengeName } = await client.send(
            adminInitiateAuthCommand
          );

          const adminRespondToAuthChallengeCommand =
            new AdminRespondToAuthChallengeCommand({
              UserPoolId: userPoolId,
              ClientId: clientId,
              ChallengeName,
              ChallengeResponses: {
                USERNAME: username,
                NEW_PASSWORD: password,
                SECRET_HASH: secretHash,
              },
              Session,
            });
          const { AuthenticationResult } = await client.send(
            adminRespondToAuthChallengeCommand
          );

          const accessToken = AuthenticationResult?.AccessToken;
          const idToken = AuthenticationResult?.IdToken;

          if (accessToken !== undefined) {
            const payload = Buffer.from(accessToken.split(".")[1], "base64").toString();
            console.log(JSON.stringify(JSON.parse(payload), null, 2));
          }

          if (idToken !== undefined) {
            const payload = Buffer.from(idToken.split(".")[1], "base64").toString();
            console.log(JSON.stringify(JSON.parse(payload), null, 2));
          }

          return AuthenticationResult;
        };
      `),
    });
    userPool.grant(
      createUserFunction.role!,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminInitiateAuth",
      "cognito-idp:AdminRespondToAuthChallenge"
    );

    const getClaimsLogGroup = new logs.LogGroup(this, "GetClaimsLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-GetClaimsFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const getClaimsFunction = new lambda.Function(this, "GetClaimsFunction", {
      functionName: `${this.stackName}-GetClaimsFunction`,
      description: `${this.stackName} get claims function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: getClaimsLogGroup,
      environment: {},
      code: lambda.Code.fromInline(`
        exports.handler = async event => {
          const body = event.requestContext.authorizer.claims;
          return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(body, null, 2),
          };
        };
      `),
    });

    // Create Rest API
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      { cognitoUserPools: [userPool] }
    );
    const restApi = new apigateway.RestApi(this, "RestApi", {
      restApiName: this.stackName,
      description: `${this.stackName} REST API`,
      endpointConfiguration: { types: [apigateway.EndpointType.EDGE] },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        allowCredentials: true,
      },
      deployOptions: { stageName: "dev", description: "dev stage" },
    });
    const commonMethodOptions: apigateway.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizationScopes: ["aws.cognito.signin.user.admin"],
    };
    new cdk.CfnOutput(this, "RestApiId", {
      description: "Rest API ID",
      value: restApi.restApiId,
    });

    // Create methods
    const accessResource = restApi.root.addResource("access");
    accessResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getClaimsFunction),
      { ...commonMethodOptions }
    );
    const idResource = restApi.root.addResource("id");
    idResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getClaimsFunction),
      { ...commonMethodOptions, authorizationScopes: [] }
    );

    // Create additional Lambda functions
    const getAuthAccessLogGroup = new logs.LogGroup(
      this,
      "GetAuthAccessLogGroup",
      {
        logGroupName: `/aws/lambda/${this.stackName}-GetAuthAccessFunction`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    new lambda.Function(this, "GetAuthAccessFunction", {
      functionName: `${this.stackName}-GetAuthAccessFunction`,
      description: `${this.stackName} get auth access function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      logGroup: getAuthAccessLogGroup,
      environment: {
        API_HOST: `${restApi.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
        API_PATH: `/${restApi.deploymentStage.stageName}${accessResource.path}`,
        CLIENT_ID: userPoolClient.userPoolClientId,
        CLIENT_SECRET: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      },
      code: lambda.Code.fromInline(`
        const crypto = require("node:crypto");
        const https = require("https");
        const {
          CognitoIdentityProviderClient,
          InitiateAuthCommand,
        } = require("@aws-sdk/client-cognito-identity-provider");

        exports.handler = async event => {
          const { username, password } = event;
          const accessToken = await getAccessToken(username, password);
          const resBody = await new Promise((resolve, reject) => {
            const req = https.request(
              {
                hostname: process.env.API_HOST,
                path: process.env.API_PATH,
                method: "GET",
                headers: { Authorization: accessToken },
              },
              res => {
                res.on("data", chunk => {
                  const body = JSON.parse(chunk.toString());
                  resolve(body);
                });
              }
            );
            req.on("error", error => {
              reject(error);
            });
            req.end();
          });
          return resBody;
        };

        const getAccessToken = async (username, password) => {
          const clientId = process.env.CLIENT_ID;
          const clientSecret = process.env.CLIENT_SECRET;
          const secretHash = crypto
            .createHmac("sha256", clientSecret)
            .update(username + clientId)
            .digest("base64");
          const client = new CognitoIdentityProviderClient();

          const initiateAuthCommand = new InitiateAuthCommand({
            ClientId: clientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: {
              USERNAME: username,
              PASSWORD: password,
              SECRET_HASH: secretHash,
            },
          });
          const { AuthenticationResult } = await client.send(initiateAuthCommand);
          return AuthenticationResult?.AccessToken;
        };
      `),
    });

    const getAuthIdLogGroup = new logs.LogGroup(this, "GetAuthIdLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-GetAuthIdFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    new lambda.Function(this, "GetAuthIdFunction", {
      functionName: `${this.stackName}-GetAuthIdFunction`,
      description: `${this.stackName} get auth ID function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      logGroup: getAuthIdLogGroup,
      environment: {
        API_HOST: `${restApi.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
        API_PATH: `/${restApi.deploymentStage.stageName}${idResource.path}`,
        CLIENT_ID: userPoolClient.userPoolClientId,
        CLIENT_SECRET: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      },
      code: lambda.Code.fromInline(`
        const crypto = require("node:crypto");
        const https = require("https");
        const {
          CognitoIdentityProviderClient,
          InitiateAuthCommand,
        } = require("@aws-sdk/client-cognito-identity-provider");

        exports.handler = async event => {
          const { username, password } = event;
          const idToken = await getIdToken(username, password);
          const resBody = await new Promise((resolve, reject) => {
            const req = https.request(
              {
                hostname: process.env.API_HOST,
                path: process.env.API_PATH,
                method: "GET",
                headers: { Authorization: idToken },
              },
              res => {
                res.on("data", chunk => {
                  const body = JSON.parse(chunk.toString());
                  resolve(body);
                });
              }
            );
            req.on("error", error => {
              reject(error);
            });
            req.end();
          });
          return resBody;
        };

        const getIdToken = async (username, password) => {
          const clientId = process.env.CLIENT_ID;
          const clientSecret = process.env.CLIENT_SECRET;
          const secretHash = crypto
            .createHmac("sha256", clientSecret)
            .update(username + clientId)
            .digest("base64");
          const client = new CognitoIdentityProviderClient();

          const initiateAuthCommand = new InitiateAuthCommand({
            ClientId: clientId,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: {
              USERNAME: username,
              PASSWORD: password,
              SECRET_HASH: secretHash,
            },
          });
          const { AuthenticationResult } = await client.send(initiateAuthCommand);
          return AuthenticationResult?.IdToken;
        };
      `),
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", {
  stackName: "apigw-cognito",
});
