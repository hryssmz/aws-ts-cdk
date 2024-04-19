// csrf-custom-header.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create REST API
    const restApi = new apigateway.RestApi(this, "RestApi", {
      restApiName: this.stackName,
      description: `${this.stackName} REST API`,
      endpointConfiguration: { types: [apigateway.EndpointType.EDGE] },
      deployOptions: { stageName: "dev", description: "dev stage" },
    });
    const corsIntegration = new apigateway.MockIntegration({
      requestTemplates: {
        "application/json": `
          #set($customHeaders = $input.params().get("header").get("Access-Control-Request-Headers").split(","))
          {
            "statusCode": #if($customHeaders.contains("x-apigw-csrf-header"))200#{else}403#end
          }
        `,
      },
      integrationResponses: [
        {
          statusCode: "200",
          selectionPattern: "2\\d{2}",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": "'*'",
            "method.response.header.Access-Control-Allow-Methods": "'*'",
            "method.response.header.Access-Control-Allow-Origin": "'*'",
          },
        },
        { statusCode: "403" },
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
          },
        },
        { statusCode: "403" },
      ],
    };

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
      code: lambda.Code.fromInline(`
        exports.handler = async event => {
          console.log(JSON.stringify(event, null, 2));
          return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Hello World" }, null, 2),
          };
        };
      `),
    });

    // Add /api resource
    const apiResource = restApi.root.addResource("api");
    apiResource.addMethod("OPTIONS", corsIntegration, corsMethodOptions);
    const getApiIntegration = new apigateway.LambdaIntegration(getApiFunction);
    apiResource.addMethod("GET", getApiIntegration);

    // Add WebACL
    const webAcl = new wafv2.CfnWebACL(this, "WebACL", {
      name: `${this.stackName}-WebACL`,
      description: `${this.stackName} Web ACL`,
      defaultAction: {
        block: {
          customResponse: {
            responseCode: 403,
            customResponseBodyKey: "forbidden",
          },
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `${this.stackName}-WebACL`,
      },
      scope: "REGIONAL",
      customResponseBodies: {
        forbidden: {
          contentType: "APPLICATION_JSON",
          content: '{ "message": "403 Forbidden" }',
        },
      },
      rules: [
        {
          name: `${this.stackName}-WebACL-Rule1`,
          priority: 1,
          action: { allow: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `${this.stackName}-WebACL-Rule1`,
          },
          statement: {
            byteMatchStatement: {
              fieldToMatch: { singleHeader: { Name: "X-WAF-CSRF-HEADER" } },
              positionalConstraint: "EXACTLY",
              searchString: "1",
              textTransformations: [{ priority: 0, type: "NONE" }],
            },
          },
        },
        {
          name: `${this.stackName}-WebACL-Rule2`,
          priority: 2,
          action: { allow: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `${this.stackName}-WebACL-Rule2`,
          },
          statement: {
            byteMatchStatement: {
              fieldToMatch: { method: {} },
              positionalConstraint: "EXACTLY",
              searchString: "OPTIONS",
              textTransformations: [{ priority: 0, type: "NONE" }],
            },
          },
        },
      ],
    });
    new wafv2.CfnWebACLAssociation(this, "WebACLAssociation", {
      resourceArn: `arn:${this.partition}:apigateway:${this.region}::/restapis/${restApi.restApiId}/stages/${restApi.deploymentStage.stageName}`,
      webAclArn: webAcl.attrArn,
    });

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
new AppStack(app, "AppStack", { stackName: "csrf-custom-header" });
