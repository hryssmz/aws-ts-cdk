// dynamodb-appsync.ts
import path from "node:path";
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create AppSync GraphQL API
    const graphqlApi = new appsync.GraphqlApi(this, "GraphqlApi", {
      name: `${this.stackName}-GraphqlApi`,
      definition: appsync.Definition.fromFile(
        path.join(__dirname, "schema.graphql")
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        },
      },
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
        excludeVerboseContent: true,
      },
    });
    if (graphqlApi.apiKey !== undefined) {
      new cdk.CfnOutput(this, "GraphqlApiApiKey", {
        description: "GraphQL API API key",
        value: graphqlApi.apiKey,
      });
    }
    new logs.LogGroup(this, "GraphqlApiLogGroup", {
      logGroupName: `/aws/appsync/apis/${graphqlApi.apiId}`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create demo DynamoDB data source
    const demoTable = new dynamodb.Table(this, "DemoTable", {
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const demoDataSource = graphqlApi.addDynamoDbDataSource(
      "DemoDataSource",
      demoTable
    );

    // Create demo DynamoDB data source resolvers
    demoDataSource.createResolver("QueryGetDemosResolver", {
      typeName: "Query",
      fieldName: "getDemos",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });
    demoDataSource.createResolver("MutationAddDemoResolver", {
      typeName: "Mutation",
      fieldName: "addDemo",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition("id").auto(),
        appsync.Values.projecting("input")
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", {
  stackName: "dynamodb-appsync",
});
