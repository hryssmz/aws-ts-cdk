// lambda-python-api.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

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
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: lambdaLogGroup,
      environment: { key: "value" },
      code: lambda.Code.fromAsset("src", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            "/bin/sh",
            "-c",
            "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output",
          ],
        },
      }),
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

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "lambda-python-api" });
