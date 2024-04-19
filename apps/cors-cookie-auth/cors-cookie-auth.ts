// cors-cookie-auth.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const allowOrigin = "http://localhost:13001";
    const allowHeaders = "x-custom-csrf-header,content-type";

    // Create REST API
    const restApi = new apigateway.RestApi(this, "RestApi", {
      restApiName: this.stackName,
      description: `${this.stackName} REST API`,
      endpointConfiguration: { types: [apigateway.EndpointType.EDGE] },
      deployOptions: { stageName: "dev", description: "dev stage" },
    });
    const corsIntegration = new apigateway.MockIntegration({
      requestTemplates: { "application/json": '{ "statusCode": 200 }' },
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": `'${allowHeaders}'`,
            "method.response.header.Access-Control-Allow-Methods": "'*'",
            "method.response.header.Access-Control-Allow-Origin": `'${allowOrigin}'`,
            "method.response.header.Access-Control-Allow-Credentials": "'true'",
          },
        },
      ],
      passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
    });
    const corsMethodOptions: apigateway.MethodOptions = {
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
            "method.response.header.Access-Control-Allow-Origin": true,
            "method.response.header.Access-Control-Allow-Credentials": true,
          },
        },
      ],
    };

    // Add Lambda authorizer
    const lambdaAuthorizerLogGroup = new logs.LogGroup(
      this,
      "LambdaAuthorizerLogGroup",
      {
        logGroupName: `/aws/lambda/${this.stackName}-LambdaAuthorizerFunction`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    const lambdaAuthorizerFunction = new lambda.Function(
      this,
      "LambdaAuthorizerFunction",
      {
        functionName: `${this.stackName}-LambdaAuthorizerFunction`,
        description: `${this.stackName} Lambda authorizer function`,
        handler: "index.handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(29),
        logGroup: lambdaAuthorizerLogGroup,
        code: lambda.Code.fromInline(`
          exports.handler = async event => {
            console.log(JSON.stringify(event, null, 2));
            return {
              principalId: "johndoe",
              policyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Action: "execute-api:Invoke",
                    Effect: "Allow",
                    Resource: event.methodArn,
                  },
                ],
              },
              context: {
                stringKey: "value",
                numberKey: 1,
                booleanKey: true,
              },
            };
          };
        `),
      }
    );
    const lambdaAuthorizer = new apigateway.TokenAuthorizer(
      this,
      "LambdaAuthorizer",
      {
        authorizerName: `${this.stackName}-LambdaAuthorizer`,
        handler: lambdaAuthorizerFunction,
        identitySource: apigateway.IdentitySource.header("Cookie"),
      }
    );

    // GET /api
    const getApiLogGroup = new logs.LogGroup(this, "GetApiLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-GetApiFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const getApiFunction = new lambda.Function(this, "GetApiFunction", {
      functionName: `${this.stackName}-GetApiFunction`,
      description: `${this.stackName} GET /api function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(29),
      logGroup: getApiLogGroup,
      environment: { ALLOW_ORIGIN: allowOrigin },
      code: lambda.Code.fromInline(`
        exports.handler = async event => {
          console.log(JSON.stringify(event, null, 2));
          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": process.env.ALLOW_ORIGIN,
              "Access-Control-Allow-Credentials": "true",
            },
            body: JSON.stringify({ message: "Hello World" }, null, 2),
          };
        };
      `),
    });

    // POST /api
    const postApiLogGroup = new logs.LogGroup(this, "PostApiLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-PostApiFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const postApiFunction = new lambda.Function(this, "PostApiFunction", {
      functionName: `${this.stackName}-PostApiFunction`,
      description: `${this.stackName} POST /api function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(29),
      logGroup: postApiLogGroup,
      environment: {
        ALLOW_ORIGIN: allowOrigin,
        DOMAIN: `${restApi.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
      },
      code: lambda.Code.fromInline(`
        exports.handler = async event => {
          console.log(JSON.stringify(event, null, 2));
          const cookie = [
            "accessToken=" + new Date().getTime().toString(),
            "Domain=" + process.env.DOMAIN,
            "HttpOnly",
            "Partitioned",
            "Path=/",
            "Max-Age=120",
            "SameSite=None",
            "Secure",
          ].join("; ");
          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": process.env.ALLOW_ORIGIN,
              "Access-Control-Allow-Credentials": "true",
              "Set-Cookie": cookie,
            },
            body: "null",
          };
        };
      `),
    });

    // Add /api resource
    const apiResource = restApi.root.addResource("api");
    apiResource.addMethod("OPTIONS", corsIntegration, corsMethodOptions);
    apiResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getApiFunction),
      {
        authorizationType: apigateway.AuthorizationType.CUSTOM,
        authorizer: lambdaAuthorizer,
      }
    );
    apiResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(postApiFunction)
    );

    // Create S3 bucket
    const bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `${this.stackName.toLowerCase()}-bucket-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new s3deploy.BucketDeployment(this, "BucketDeployment", {
      sources: [s3deploy.Source.asset("./dist")],
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
    const restApiOrigin = new origins.RestApiOrigin(restApi);
    distribution.addBehavior("/api/*", restApiOrigin, {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy:
        cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    });

    // Outputs
    new cdk.CfnOutput(this, "DistributionURL", {
      description: "Distribution URL",
      value: `http://${distribution.domainName}`,
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "cors-cookie-auth" });
