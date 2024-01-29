// acm-certificate.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const domainName = "hryssmz.click";

    // Create ACM certificate
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName,
    });
    new acm.Certificate(this, "Certificate", {
      domainName,
      certificateName: "Certificate",
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    new acm.Certificate(this, "WwwCertificate", {
      domainName: `www.${domainName}`,
      certificateName: "WwwCertificate",
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", {
  stackName: "acm-certificate",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
