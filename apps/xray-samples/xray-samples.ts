// xray-samples.ts
import path from "node:path";
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as xray from "aws-cdk-lib/aws-xray";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create DynamoDB table
    const ddbTable = new dynamodb.Table(this, "DdbTable", {
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create SNS topic
    const snsTopic = new sns.Topic(this, "SnsTopic", {
      topicName: `${this.stackName}-snsTopic`,
      displayName: `${this.stackName} SNS Topic`,
    });

    // Create aws-xray-sdk Lambda Layer
    const xraySdkLayer = new lambda.LayerVersion(this, "XraySdkLayer", {
      layerVersionName: `${this.stackName}-XraySdkLayer`,
      description: `${this.stackName} XRay SDK layer`,
      compatibleArchitectures: [lambda.Architecture.X86_64],
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      code: lambda.Code.fromAsset(path.join(__dirname, "xray-sdk-layer.zip")),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create writer Lambda function
    const writerLogGroup = new logs.LogGroup(this, "WriterLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-WriterFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const writerFunction = new lambda.Function(this, "WriterFunction", {
      functionName: `${this.stackName}-WriterFunction`,
      description: `${this.stackName} Writer function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: writerLogGroup,
      environment: { TABLE_NAME: ddbTable.tableName },
      layers: [xraySdkLayer],
      tracing: lambda.Tracing.ACTIVE,
      code: lambda.Code.fromInline(`
        const { randomUUID } = require("node:crypto");
        const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
        const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
        const AWSXRay = require("aws-xray-sdk");
        const ddb = AWSXRay.captureAWSv3Client(new DynamoDBClient());

        exports.handler = async () => {
          const tableName = process.env.TABLE_NAME;
          const client = DynamoDBDocumentClient.from(ddb);
          const item = { id: randomUUID(), date: new Date().toISOString() };
          const command = new PutCommand({
            TableName: tableName,
            Item: item,
          });
          await client.send(command);
          return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ item }, null, 2),
          };
        };
      `),
    });
    ddbTable.grantWriteData(writerFunction);

    // Create writer Rest API
    const writerApi = new apigateway.RestApi(this, "WriterApi", {
      restApiName: `${this.stackName}-WriterApi`,
      description: `${this.stackName} writer API`,
      endpointConfiguration: { types: [apigateway.EndpointType.EDGE] },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        allowCredentials: true,
      },
      deployOptions: {
        stageName: "dev",
        description: "dev stage",
        tracingEnabled: true,
      },
    });
    writerApi.root.addMethod(
      "GET",
      new apigateway.LambdaIntegration(writerFunction)
    );

    // Create HTTP client Lambda function
    const httpClientLogGroup = new logs.LogGroup(this, "HttpClientLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-HttpClientFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const httpClientFunction = new lambda.Function(this, "HttpClientFunction", {
      functionName: `${this.stackName}-HttpClientFunction`,
      description: `${this.stackName} HTTP client function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: httpClientLogGroup,
      environment: { URL: writerApi.url },
      layers: [xraySdkLayer],
      tracing: lambda.Tracing.ACTIVE,
      code: lambda.Code.fromInline(`
        const https = require("node:https");
        const AWSXRay = require("aws-xray-sdk");
        const capturedHttps = AWSXRay.captureHTTPs(https);

        exports.handler = async () => {
          const url = new URL(process.env.URL);
          const { hostname, pathname } = url;
          const response = await new Promise((resolve, reject) => {
            const req = capturedHttps.request(
              { hostname, port: 443, path: pathname, method: "GET" },
              res => {
                res.on("data", chunk => {
                  const body = chunk.toString();
                  resolve(body);
                });
              }
            );
            req.on("error", e => {
              reject(e.message);
            });
            req.end();
          });

          return response;
        };
      `),
    });

    // Create publisher Lambda function
    const publisherLogGroup = new logs.LogGroup(this, "PublisherLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-PublisherFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const publisherFunction = new lambda.Function(this, "PublisherFunction", {
      functionName: `${this.stackName}-PublisherFunction`,
      description: `${this.stackName} Publisher function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(28),
      logGroup: publisherLogGroup,
      environment: { TOPIC_ARN: snsTopic.topicArn },
      layers: [xraySdkLayer],
      tracing: lambda.Tracing.ACTIVE,
      code: lambda.Code.fromInline(`
        const { PublishCommand, SNSClient } = require("@aws-sdk/client-sns");
        const AWSXRay = require("aws-xray-sdk");
        const client = AWSXRay.captureAWSv3Client(new SNSClient());

        exports.handler = async () => {
          const topicArn = process.env.TOPIC_ARN;
          const command = new PublishCommand({
            Subject: "Publish title",
            Message: "Lorem ipsum dolor sit amet consectetur adipisicing.",
            TopicArn: topicArn,
          });
          const { MessageId: messageId } = await client.send(command);
          return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ messageId }, null, 2),
          };
        };
      `),
    });
    snsTopic.grantPublish(publisherFunction);

    // Create publisher Rest API
    const publisherApi = new apigateway.RestApi(this, "PublisherApi", {
      restApiName: `${this.stackName}-PublisherApi`,
      description: `${this.stackName} publisher API`,
      endpointConfiguration: { types: [apigateway.EndpointType.EDGE] },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        allowCredentials: true,
      },
      deployOptions: {
        stageName: "dev",
        description: "dev stage",
        tracingEnabled: true,
      },
    });
    publisherApi.root.addMethod(
      "GET",
      new apigateway.LambdaIntegration(publisherFunction)
    );

    // Create Step Functions
    const writerTask = new tasks.LambdaInvoke(this, "WriterTask", {
      lambdaFunction: writerFunction,
    });
    const publishApiTask = new tasks.CallApiGatewayRestApiEndpoint(
      this,
      "PublishApiTask",
      {
        api: publisherApi,
        stageName: publisherApi.deploymentStage.stageName,
        method: tasks.HttpMethod.GET,
        apiPath: "/",
      }
    );
    const publishSnsTask = new tasks.SnsPublish(this, "PublishSnsTask", {
      topic: snsTopic,
      message: sfn.TaskInput.fromText("From Step Functions!"),
    });
    const parallelTask = new sfn.Parallel(this, "ParallelState");
    parallelTask.branch(writerTask);
    parallelTask.branch(publishApiTask);
    const definition = publishSnsTask.next(parallelTask);
    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      stateMachineName: `${this.stackName}-StateMachine`,
      comment: `${this.stackName} state machine`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      tracingEnabled: true,
    });

    // Add SNS subscriptions
    snsTopic.addSubscription(
      new subscriptions.LambdaSubscription(writerFunction)
    );
    snsTopic.addSubscription(
      new subscriptions.LambdaSubscription(httpClientFunction)
    );

    // Create XRay groups
    new xray.CfnGroup(this, "WriterFunctionGroup", {
      groupName: writerFunction.functionName,
      filterExpression: `service("${writerFunction.functionName}")`,
    });
    new xray.CfnGroup(this, "HttpClientFunctionGroup", {
      groupName: httpClientFunction.functionName,
      filterExpression: `service("${httpClientFunction.functionName}")`,
    });
    new xray.CfnGroup(this, "PublisherFunctionGroup", {
      groupName: publisherFunction.functionName,
      filterExpression: `service("${httpClientFunction.functionName}")`,
    });
    new xray.CfnGroup(this, "WriterApiGroup", {
      groupName: writerApi.restApiName,
      filterExpression: `service("${writerApi.restApiName}/${writerApi.deploymentStage.stageName}")`,
    });
    new xray.CfnGroup(this, "PublisherApiGroup", {
      groupName: publisherApi.restApiName,
      filterExpression: `service("${publisherApi.restApiName}/${publisherApi.deploymentStage.stageName}")`,
    });
    new xray.CfnGroup(this, "StateMachineGroup", {
      groupName: stateMachine.stateMachineName,
      filterExpression: `service("${stateMachine.stateMachineName}")`,
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "xray-samples" });
