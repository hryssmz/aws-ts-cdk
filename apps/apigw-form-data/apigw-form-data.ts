// apigw-form-data.ts
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

    // Create Rest API
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
      binaryMediaTypes: ["*/*"],
    });
    const apiResource = new apigateway.Resource(this, "ApiResource", {
      parent: restApi.root,
      pathPart: "api",
    });
    const helloResource = new apigateway.Resource(this, "HelloResource", {
      parent: apiResource,
      pathPart: "hello",
    });
    const uploadResource = new apigateway.Resource(this, "UploadResource", {
      parent: apiResource,
      pathPart: "upload",
    });

    // GET /api/hello
    const helloWorldLogGroup = new logs.LogGroup(this, "HelloWorldLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-HelloWorldFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const helloWorldFunction = new lambda.Function(this, "HelloWorldFunction", {
      functionName: `${this.stackName}-HelloWorldFunction`,
      description: `${this.stackName} Hello World function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: helloWorldLogGroup,
      environment: {},
      code: lambda.Code.fromInline(`
        exports.handler = async () => {
          return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Hello World!" }, null, 2),
          };
        };
      `),
    });
    helloResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(helloWorldFunction)
    );

    // POST /api/upload
    const uploadLogGroup = new logs.LogGroup(this, "UploadLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-UploadFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const uploadFunction = new lambda.Function(this, "UploadFunction", {
      functionName: `${this.stackName}-UploadFunction`,
      description: `${this.stackName} Upload function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: uploadLogGroup,
      environment: {
        BUCKET_NAME: `${bucket.bucketName}`,
        OBJECT_KEY: "favicon.ico",
      },
      code: lambda.Code.fromInline(`
        const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");

        exports.handler = async event => {
          const multipart = Buffer.from(event.body, "base64").toString();
          console.log(multipart);
          const client = new S3Client();
          const command = new GetObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: process.env.OBJECT_KEY,
          });
          const { Body } = await client.send(command);
          const content = await Body.transformToByteArray();
          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "image/x-icon",
              "Content-Disposition": 'attachment; filename="favicon.ico"',
            },
            body: Buffer.from(content).toString("base64"),
            isBase64Encoded: true,
          };
        };
      `),
    });
    bucket.grantRead(uploadFunction);
    uploadResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(uploadFunction)
    );

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
    });
    new cdk.CfnOutput(this, "DistributionURL", {
      description: "Distribution URL",
      value: `http://${distribution.domainName}`,
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "apigw-form-data" });
