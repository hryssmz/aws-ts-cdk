// route53-dns.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

class Route53DNSProvider extends Construct {
  public readonly serviceToken: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    const stack = cdk.Stack.of(scope);

    // Create Lambda function
    const onEventLogGroup = new logs.LogGroup(this, "OnEventLogGroup", {
      logGroupName: `/aws/lambda/${stack.stackName}-Route53DNSOnEventLogGroup`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const onEvent = new lambda.Function(this, "OnEvent", {
      functionName: `${stack.stackName}-Route53DNSOnEventFunction`,
      description: `${stack.stackName} Route53DNS onEvent function`,
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(14),
      logGroup: onEventLogGroup,
      code: lambda.Code.fromInline(`
        const {
          Route53DomainsClient,
          UpdateDomainNameserversCommand,
        } = require("@aws-sdk/client-route-53-domains");
        
        exports.handler = async event => {
          console.log(JSON.stringify(event, null, 2));
          const client = new Route53DomainsClient({ region: "us-east-1" });
          const { ResourceProperties } = event;
          const { DomainName, NameServers } = ResourceProperties;
          if (event.RequestType === "Create" || event.RequestType === "Update") {
            const command = new UpdateDomainNameserversCommand({
              DomainName,
              Nameservers: NameServers.map(Name => ({ Name })),
            });
            await client.send(command);
            return {
              PhysicalResourceId: DomainName,
              Data: { NameServers },
            };
          } else {
            return {};
          }
        };
      `),
    });
    onEvent.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["route53domains:UpdateDomainNameservers"],
        resources: ["*"],
      })
    );

    // Create provider
    const provider = new cr.Provider(this, "Provider", {
      onEventHandler: onEvent,
      providerFunctionName: `${stack.stackName}-Route53DNSProviderFunction`,
    });
    this.serviceToken = provider.serviceToken;
  }

  public static getOrCreate(scope: Construct) {
    const stack = cdk.Stack.of(scope);
    const id = Route53DNSProvider.name;
    const child = stack.node.tryFindChild(id);
    return child !== undefined
      ? (child as Route53DNSProvider)
      : new Route53DNSProvider(stack, id);
  }
}

interface Route53DNSProps {
  hostedZone: route53.IHostedZone;
}

class Route53DNS extends Construct {
  constructor(scope: Construct, id: string, props: Route53DNSProps) {
    super(scope, id);
    const provider = Route53DNSProvider.getOrCreate(scope);

    // Create custom resource
    new cdk.CustomResource(this, "Route53DNS", {
      resourceType: "Custom::Route53DNS",
      serviceToken: provider.serviceToken,
      properties: {
        DomainName: props.hostedZone.zoneName,
        NameServers: props.hostedZone.hostedZoneNameServers,
      },
    });
  }
}

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Route 53 hosted zone
    const hostedZone = new route53.PublicHostedZone(this, "HostedZone", {
      zoneName: "hryssmz.click",
      comment: "My public hosted zone",
    });
    new cdk.CfnOutput(this, "HostedZoneNameServers", {
      description: "Hosted zone name servers",
      value: cdk.Fn.join(",", hostedZone.hostedZoneNameServers ?? []),
    });

    // Create Route 53 DNS
    new Route53DNS(this, "Route53DNS", { hostedZone });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", { stackName: "route53-dns" });
