#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as pipelines from "aws-cdk-lib/pipelines";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Lambda function
    const lambdaLogGroup = new logs.LogGroup(this, "LambdaLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-LambdaLogGroup`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const lambdaFunction = new lambda.Function(this, "LambdaFunction", {
      functionName: `${this.stackName}-LambdaFunction`,
      description: `${this.stackName} Lambda function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: lambdaLogGroup,
      environment: { key: "value" },
      code: lambda.Code.fromInline(`
        exports.handler = async (event, context) => {
          console.log(JSON.stringify(event, null, 2));
          console.log(JSON.stringify(context, null, 2));
          console.log(JSON.stringify(process.env, null, 2));
          const body = { message: "Hello World!" };
          return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(body, null, 2),
          };
        };
      `),
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
    });
    restApi.root.addMethod(
      "GET",
      new apigateway.LambdaIntegration(lambdaFunction)
    );
  }
}

class AppStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    new AppStack(this, "AppStack", { stackName: "cdk-pipeline-app" });
  }
}

class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create artifacts bucket
    const bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `${this.stackName.toLowerCase()}-bucket-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create source
    const repository = new codecommit.Repository(this, "Repository", {
      repositoryName: this.stackName,
      description: `${this.stackName} CodeCommit repository`,
    });
    new cdk.CfnOutput(this, "RepositoryCloneUrl", {
      description: "Repository clone URL",
      value: repository.repositoryCloneUrlHttp,
    });
    const source = pipelines.CodePipelineSource.codeCommit(repository, "main", {
      actionName: "Source",
    });

    // Create pipeline
    const buildLogGroup = new logs.LogGroup(this, "BuildLogGroup", {
      logGroupName: `/aws/codebuild/${this.stackName}-BuildLogGroup`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const synthStep = new pipelines.ShellStep("Build", {
      input: source,
      commands: ["npm ci", "npm run build", "npx cdk synth"],
    });
    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      pipelineName: this.stackName,
      artifactBucket: bucket,
      synth: synthStep,
      selfMutation: false,
      useChangeSets: false,
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
          computeType: codebuild.ComputeType.SMALL,
        },
        logging: { cloudWatch: { logGroup: buildLogGroup } },
        timeout: cdk.Duration.minutes(30),
      },
    });

    // Add stage
    const appStage = new AppStage(this, "AppStage", { stageName: "Deploy" });
    pipeline.addStage(appStage);
  }
}

const app = new cdk.App();
new PipelineStack(app, "PipelineStack", { stackName: "cdk-pipeline" });
