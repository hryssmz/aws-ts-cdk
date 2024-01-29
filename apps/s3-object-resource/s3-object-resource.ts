// s3-object-resource.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

class S3ObjectProvider extends Construct {
  public readonly serviceToken: string;

  private constructor(scope: Construct, id: string) {
    super(scope, id);
    const stack = cdk.Stack.of(scope);

    // Create Lambda function
    const onEventLogGroup = new logs.LogGroup(this, "OnEventLogGroup", {
      logGroupName: `/aws/lambda/${stack.stackName}-S3ObjectOnEventFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const onEvent = new lambda.Function(this, "OnEvent", {
      functionName: `${stack.stackName}-S3ObjectOnEventFunction`,
      description: `${stack.stackName} S3Object onEvent function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(14),
      logGroup: onEventLogGroup,
      code: lambda.Code.fromInline(`
        const {
          DeleteObjectCommand,
          PutObjectCommand,
          S3Client,
        } = require("@aws-sdk/client-s3");
        
        exports.handler = async event => {
          console.log(JSON.stringify(event, null, 2));
          const client = new S3Client();
          const { ResourceProperties } = event;
          const { Bucket, Key, Body, ContentType, Base64 } = ResourceProperties;
          if (event.RequestType === "Create" || event.RequestType === "Update") {
            const command = new PutObjectCommand({
              Bucket,
              Key,
              // Base64 is a string, not a boolean
              Body: Base64 === "true" ? Buffer.from(Body, "base64") : Body,
              ContentType,
            });
            await client.send(command);
            return {
              PhysicalResourceId: "s3://" + Bucket + "/" + Key,
              Data: { Bucket, Key },
            };
          } else {
            const command = new DeleteObjectCommand({ Bucket, Key });
            await client.send(command);
            return {};
          }
        };
      `),
    });
    onEvent.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject", "s3:DeleteObject"],
        resources: ["*"],
      })
    );

    // Create provider
    const provider = new cr.Provider(this, "Provider", {
      onEventHandler: onEvent,
      providerFunctionName: `${stack.stackName}-S3ObjectProviderFunction`,
    });
    this.serviceToken = provider.serviceToken;
  }

  public static getOrCreate(scope: Construct) {
    const stack = cdk.Stack.of(scope);
    const id = S3ObjectProvider.name;
    const child = stack.node.tryFindChild(id);
    return child !== undefined
      ? (child as S3ObjectProvider)
      : new S3ObjectProvider(stack, id);
  }
}

interface S3ObjectProps {
  bucket: s3.IBucket;
  key: string;
  body: string;
  contentType?: string;
  base64?: boolean;
}

class S3Object extends Construct {
  constructor(scope: Construct, id: string, props: S3ObjectProps) {
    super(scope, id);
    const provider = S3ObjectProvider.getOrCreate(scope);

    // Create custom resource
    new cdk.CustomResource(this, "S3Object", {
      resourceType: "Custom::S3Object",
      serviceToken: provider.serviceToken,
      properties: {
        Bucket: props.bucket.bucketName,
        Key: props.key,
        Body: props.body,
        ContentType: props.contentType,
        Base64: props.base64,
      },
    });
  }
}

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

    // Create S3 objects
    new S3Object(this, "IndexHtmlObject", {
      bucket,
      key: "index.html",
      body: "<h1>Hello World!</h1>",
      contentType: "text/html",
    });
    new S3Object(this, "FaviconIcoObject", {
      bucket,
      key: "favicon.ico",
      body: [
        "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",
      ].join("\n"),
      contentType: "image/vnd.microsoft.icon",
      base64: true,
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "s3-object-resource" });
