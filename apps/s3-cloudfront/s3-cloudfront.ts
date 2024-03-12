// s3-cloudfront.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
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

    // Create CloudFront distribution
    const cloudfrontFunction = new cloudfront.Function(
      this,
      "CloudFrontFunction",
      {
        comment: "CloudFront function",
        functionName: `${this.stackName}-CloudFrontFunction`,
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        code: cloudfront.FunctionCode.fromInline(`
          async function handler(event) {
            const request = event.request;
            request.uri = "/index.html";
            return request;
          }
        `),
      }
    );
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "CloudFront distribution",
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        functionAssociations: [
          {
            function: cloudfrontFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      defaultRootObject: "index.html",
    });
    new cdk.CfnOutput(this, "DistributionURL", {
      description: "Distribution URL",
      value: `http://${distribution.domainName}`,
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "s3-cloudfront" });
