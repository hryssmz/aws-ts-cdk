// sfn-activity.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define DynamoDB table
    const activityTable = new dynamodb.Table(this, "ActivityTable", {
      tableName: `${this.stackName}-ActivityTable`,
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Define activity task
    const activity = new sfn.Activity(this, "Activity", {
      activityName: `${this.stackName}-Activity`,
    });
    const workerLogGroup = new logs.LogGroup(this, "WorkerLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-WorkerFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const workerFunction = new lambda.Function(this, "WorkerFunction", {
      functionName: `${this.stackName}-WorkerFunction`,
      description: `${this.stackName} Worker function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(3),
      logGroup: workerLogGroup,
      environment: { ACTIVITY_TABLE: activityTable.tableName },
      code: lambda.Code.fromInline(`
        const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
        const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
        const { SendTaskSuccessCommand, SFNClient } = require("@aws-sdk/client-sfn");
        
        const getTaskToken = async id => {
          const client = DynamoDBDocumentClient.from(new DynamoDBClient());
          const command = new GetCommand({
            TableName: process.env.ACTIVITY_TABLE,
            Key: { id },
          });
          const { Item } = await client.send(command);
          return Item?.taskToken ?? "";
        };
        
        exports.handler = async event => {
          const { id } = event;
          const taskToken = await getTaskToken(id);
          const client = new SFNClient();
          const output = JSON.stringify({ id }, null, 2);
          const command = new SendTaskSuccessCommand({ output, taskToken });
          await client.send(command);
          return { id, taskToken };
        };
      `),
    });
    activity.grant(workerFunction, "states:SendTaskSuccess");
    activityTable.grant(workerFunction, "dynamodb:GetItem");
    const activityTask = new tasks.StepFunctionsInvokeActivity(
      this,
      "ActivityTask",
      {
        stateName: "ActivityTask",
        comment: "Activity Task",
        activity,
        taskTimeout: sfn.Timeout.duration(cdk.Duration.seconds(30)),
      }
    );

    // Define delete activity task
    const deleteActivityTask = new tasks.DynamoDeleteItem(
      this,
      "DeleteActivityTask",
      {
        stateName: "DeleteActivityTask",
        comment: "Delete activity task",
        table: activityTable,
        key: {
          id: tasks.DynamoAttributeValue.fromString(
            sfn.JsonPath.stringAt("$.id")
          ),
        },
      }
    );

    // Define timeout handle task
    const handleTimeoutLogGroup = new logs.LogGroup(
      this,
      "HandleTimeoutLogGroup",
      {
        logGroupName: `/aws/lambda/${this.stackName}-HandleTimeoutFunction`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    const handleTimeoutFunction = new lambda.Function(
      this,
      "HandleTimeoutFunction",
      {
        functionName: `${this.stackName}-HandleTimeoutFunction`,
        description: `${this.stackName} Handle timeout function`,
        handler: "index.handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.X86_64,
        timeout: cdk.Duration.seconds(3),
        logGroup: handleTimeoutLogGroup,
        environment: { ACTIVITY_TABLE: activityTable.tableName },
        code: lambda.Code.fromInline(`
          const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
          const {
            DynamoDBDocumentClient,
            DeleteCommand,
          } = require("@aws-sdk/lib-dynamodb");
          const { DescribeExecutionCommand, SFNClient } = require("@aws-sdk/client-sfn");
          
          const deleteItem = async id => {
            const client = DynamoDBDocumentClient.from(new DynamoDBClient());
            const command = new DeleteCommand({
              TableName: process.env.ACTIVITY_TABLE,
              Key: { id },
            });
            const { Attributes } = await client.send(command);
            return Attributes;
          };
          
          exports.handler = async event => {
            const { executionArn } = event;
            const client = new SFNClient();
            const command = new DescribeExecutionCommand({ executionArn });
            const { input } = await client.send(command);
            const { id } = JSON.parse(input ?? "{}");
            const attributes = await deleteItem(id);
            return attributes;
          };
        `),
      }
    );
    handleTimeoutFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["states:DescribeExecution"],
        resources: [
          `arn:${this.partition}:states:${this.region}:${this.account}:execution:${this.stackName}-StateMachine:*`,
        ],
      })
    );
    activityTable.grant(handleTimeoutFunction, "dynamodb:DeleteItem");
    const handleTimeoutTask = new tasks.LambdaInvoke(
      this,
      "HandleTimeoutTask",
      {
        stateName: "HandleTimeoutTask",
        comment: "Handle timeout task",
        lambdaFunction: handleTimeoutFunction,
        payload: sfn.TaskInput.fromObject({
          "executionArn.$": "$$.Execution.Id",
        }),
      }
    );
    activityTask.addCatch(handleTimeoutTask, {
      errors: [sfn.Errors.TIMEOUT],
    });

    // Define wait task
    const wait = new sfn.Wait(this, "Wait", {
      stateName: "Wait",
      comment: "Wait",
      time: sfn.WaitTime.duration(cdk.Duration.seconds(1)),
    });

    // Define get acitivity task
    const getActivityLogGroup = new logs.LogGroup(this, "GetActivityLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-GetActivityFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const getActivityFunction = new lambda.Function(
      this,
      "GetActivityFunction",
      {
        functionName: `${this.stackName}-GetActivityFunction`,
        description: `${this.stackName} Get activity function`,
        handler: "index.handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.X86_64,
        timeout: cdk.Duration.seconds(3),
        logGroup: getActivityLogGroup,
        environment: { ACTIVITY_ARN: activity.activityArn },
        code: lambda.Code.fromInline(`
          const { GetActivityTaskCommand, SFNClient } = require("@aws-sdk/client-sfn");

          exports.handler = async () => {
            const activityArn = process.env.ACTIVITY_ARN ?? "";
            const client = new SFNClient();
            const command = new GetActivityTaskCommand({ activityArn });
            const { input, taskToken } = await client.send(command);
            const { id } = JSON.parse(input ?? "{}");
            return { id, taskToken };
          };
        `),
      }
    );
    activity.grant(getActivityFunction, "states:GetActivityTask");
    const getActivityTask = new tasks.LambdaInvoke(this, "GetActivityTask", {
      stateName: "GetActivityTask",
      comment: "Get activity task",
      lambdaFunction: getActivityFunction,
      resultSelector: {
        "id.$": "$.Payload.id",
        "taskToken.$": "$.Payload.taskToken",
      },
    });

    // Define put activity task
    const putActivityTask = new tasks.DynamoPutItem(this, "PutActivityTask", {
      stateName: "PutActivityTask",
      comment: "Put activity task",
      table: activityTable,
      item: {
        id: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.id")
        ),
        taskToken: tasks.DynamoAttributeValue.fromString(
          sfn.JsonPath.stringAt("$.taskToken")
        ),
      },
    });

    // Define parallel task
    const parallel = new sfn.Parallel(this, "Parallel", {
      stateName: "Parallel",
      comment: "Parallel state",
    });
    parallel.branch(activityTask.next(deleteActivityTask));
    parallel.branch(wait.next(getActivityTask).next(putActivityTask));

    // Define state machine
    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      stateMachineName: `${this.stackName}-StateMachine`,
      comment: `${this.stackName} state machine`,
      definitionBody: sfn.DefinitionBody.fromChainable(parallel),
    });

    // Define state machine executor
    const executorLogGroup = new logs.LogGroup(this, "ExecutorLogGroup", {
      logGroupName: `/aws/lambda/${this.stackName}-ExecutorFunction`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const executorFunction = new lambda.Function(this, "ExecutorFunction", {
      functionName: `${this.stackName}-ExecutorFunction`,
      description: `${this.stackName} Executor function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(3),
      logGroup: executorLogGroup,
      environment: { STATE_MACHINE_ARN: stateMachine.stateMachineArn },
      code: lambda.Code.fromInline(`
        const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

        exports.handler = async event => {
          const { id } = event;
          const stateMachineArn = process.env.STATE_MACHINE_ARN;
          const client = new SFNClient();
          const input = JSON.stringify({ id }, null, 2);
          const command = new StartExecutionCommand({ stateMachineArn, input });
          const { executionArn } = await client.send(command);
          return { id, executionArn };
        };
      `),
    });
    stateMachine.grantStartExecution(executorFunction);
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "sfn-activity" });
