#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Lambda function
    const nodejsLogGroup = new logs.LogGroup(this, "NodejsLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-NodejsLogGroup`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const nodejsFunction = new nodejs.NodejsFunction(this, "NodejsFunction", {
      functionName: `${this.stackName}-NodejsFunction`,
      description: `${this.stackName} Node.js function`,
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: nodejsLogGroup,
      environment: { key: "value" },
      entry: "src/index.ts",
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
      new apigateway.LambdaIntegration(nodejsFunction)
    );
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "lambda-ts-api" });
