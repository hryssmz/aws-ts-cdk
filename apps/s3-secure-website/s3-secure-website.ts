// s3-secure-website.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const domainName = "hryssmz.click";
    const wwwDomainName = `www.${domainName}`;

    // Create ACM certificate
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName,
    });
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName,
      certificateName: "Certificate",
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    const wwwCertificate = new acm.Certificate(this, "WwwCertificate", {
      domainName: wwwDomainName,
      certificateName: "WwwCertificate",
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create S3 bucket
    const bucket = new s3.Bucket(this, "Bucket", {
      bucketName: domainName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      websiteRedirect: {
        hostName: wwwDomainName,
        protocol: s3.RedirectProtocol.HTTPS,
      },
    });
    const wwwBucket = new s3.Bucket(this, "WwwBucket", {
      bucketName: wwwDomainName,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new s3deploy.BucketDeployment(this, "BucketDeployment", {
      sources: [s3deploy.Source.asset("./dist")],
      destinationBucket: wwwBucket,
      destinationKeyPrefix: "",
    });

    // Create CloudFront destribution
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "CloudFront distribution",
      domainNames: [domainName],
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1,
      sslSupportMethod: cloudfront.SSLMethod.SNI,
    });
    const wwwDistribution = new cloudfront.Distribution(
      this,
      "WwwDistribution",
      {
        comment: "CloudFront www distribution",
        domainNames: [wwwDomainName],
        defaultBehavior: {
          origin: new origins.S3Origin(wwwBucket),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: "index.html",
        certificate: wwwCertificate,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1,
        sslSupportMethod: cloudfront.SSLMethod.SNI,
      }
    );

    // Create Route 53 records
    new route53.ARecord(this, "ARecord", {
      zone: hostedZone,
      recordName: domainName,
      comment: "A record",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
    });
    new route53.ARecord(this, "WwwARecord", {
      zone: hostedZone,
      recordName: wwwDomainName,
      comment: "www A record",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(wwwDistribution)
      ),
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", {
  stackName: "s3-secure-website",
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
});
