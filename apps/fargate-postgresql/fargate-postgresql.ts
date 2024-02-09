// fargate-postgresql.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dbuser = "postgres";
    const dbpassword = "postgres";
    const dbport = 5432;
    const dbname = "postgres";

    // Create VPC
    const vpc = new ec2.Vpc(this, "VPC", {
      ipAddresses: ec2.IpAddresses.cidr("172.20.0.0/16"),
      restrictDefaultSecurityGroup: true,
      maxAzs: 1,
      reservedAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        { subnetType: ec2.SubnetType.PUBLIC, name: "Public" },
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: "Private",
          reserved: true,
        },
      ],
    });

    // Create ECS cluster
    const ecsExecLogGroup = new logs.LogGroup(this, "ECSExecLogGroup", {
      logGroupName: `/aws/ecs/${this.stackName}-ECSExecLogGroup`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: `${this.stackName}-Cluster`,
      vpc,
      enableFargateCapacityProviders: true,
      executeCommandConfiguration: {
        logging: ecs.ExecuteCommandLogging.OVERRIDE,
        logConfiguration: {
          cloudWatchLogGroup: ecsExecLogGroup,
        },
      },
      defaultCloudMapNamespace: {
        name: `${this.stackName}-ECSNamespace`,
        type: servicediscovery.NamespaceType.HTTP,
        useForServiceConnect: true,
      },
    });
    cluster.addDefaultCapacityProviderStrategy([
      { capacityProvider: "FARGATE", weight: 1 },
      { capacityProvider: "FARGATE_SPOT", weight: 1 },
    ]);

    // Create ECS task definition
    const dbSecret = new secretsmanager.Secret(this, "DBSecret", {
      secretName: `${this.stackName}-dbSecret`,
      description: `${this.stackName} DB secret`,
      secretObjectValue: {
        username: cdk.SecretValue.unsafePlainText(dbuser),
        password: cdk.SecretValue.unsafePlainText(dbpassword),
        dbname: cdk.SecretValue.unsafePlainText(dbname),
      },
    });
    const ecsLogGroup = new logs.LogGroup(this, "ECSLogGroup", {
      logGroupName: `/aws/ecs/${this.stackName}-ECSLogGroup`,
      retention: Infinity,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      {
        family: `${this.stackName}-TaskDefinition`,
        cpu: 256,
        memoryLimitMiB: 512,
      }
    );
    taskDefinition.addContainer("postgres", {
      containerName: "postgres",
      essential: true,
      image: ecs.ContainerImage.fromRegistry("postgres:latest"),
      environment: {
        POSTGRES_HOST_AUTH_METHOD: "md5",
      },
      secrets: {
        POSTGRES_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
        POSTGRES_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
        POSTGRES_DB: ecs.Secret.fromSecretsManager(dbSecret, "dbname"),
      },
      portMappings: [{ containerPort: dbport }],
      logging: new ecs.AwsLogDriver({
        logGroup: ecsLogGroup,
        streamPrefix: "Task",
      }),
      healthCheck: {
        command: [
          "CMD-SHELL",
          `pg_isready -q -h localhost -p ${dbport} || exit 1`,
        ],
      },
    });

    // Create ECS service
    const ecsService = new ecs.FargateService(this, "ECSService", {
      serviceName: `${this.stackName}-ECSService`,
      cluster,
      taskDefinition,
      assignPublicIp: true, // Required to pull image from the Internet
      enableECSManagedTags: true,
      enableExecuteCommand: true,
      desiredCount: 1,
    });

    // Create NLB
    const nlbSecurityGroup = new ec2.SecurityGroup(this, "NLBSecurityGroup", {
      securityGroupName: `${this.stackName}-NLBSecurityGroup`,
      description: `${this.stackName} NLB security group`,
      vpc,
      allowAllOutbound: false,
    });
    nlbSecurityGroup.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(dbport),
      `Allow incoming traffic from the world on port ${dbport}`
    );
    nlbSecurityGroup.connections.allowTo(
      ecsService,
      ec2.Port.tcp(dbport),
      `Allow traffic from NLB to ECS service on port ${dbport}`
    );
    const nlb = new elbv2.NetworkLoadBalancer(this, "NLB", {
      vpc,
      ipAddressType: elbv2.IpAddressType.IPV4,
      internetFacing: true,
      securityGroups: [nlbSecurityGroup],
    });
    const nlbListener = nlb.addListener("NLBListener", { port: dbport });
    nlbListener.addTargets("NLBTargetGroup", {
      targetGroupName: `${this.stackName}-NLBTG`,
      protocol: elbv2.Protocol.TCP,
      port: dbport,
      deregistrationDelay: cdk.Duration.seconds(10),
      healthCheck: {
        enabled: true,
        protocol: elbv2.Protocol.TCP,
        interval: cdk.Duration.seconds(10),
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,
      },
      targets: [ecsService],
    });
    new cdk.CfnOutput(this, "PsqlCommand", {
      description: "psql command",
      value: `psql -d postgresql://${dbuser}:${dbpassword}@${nlb.loadBalancerDnsName}:${dbport}/${dbname}`,
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", {
  stackName: "fargate-postgresql",
});
