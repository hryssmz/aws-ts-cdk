// ec2-docker.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dbuser = "postgres";
    const dbpassword = "postgres";
    const dbport = 5432;
    const dbname = "postgres";
    const unindent = (text: string, spaces = 6, lines = 1, suffix = "\n") =>
      text
        .split("\n")
        .slice(lines, -lines || undefined)
        .map(text => text.replace(new RegExp(`^ {${spaces}}`), ""))
        .join("\n") + suffix;

    // Create VPC
    const vpc = new ec2.Vpc(this, "VPC", {
      ipAddresses: ec2.IpAddresses.cidr("172.20.0.0/16"),
      restrictDefaultSecurityGroup: false,
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

    // Create SSM parameter
    const cloudwatchAgentLogGroup = new logs.LogGroup(
      this,
      "CloudWatchAgentLogGroup",
      {
        logGroupName: `/aws/ec2/${this.stackName}-CloudWatchAgentLogGroup`,
        retention: Infinity,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    const cloudwatchAgentParameterValue = `
      {
        "agent": {
          "metrics_collection_interval": 60,
          "logfile": "/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log"
        },
        "logs": {
          "logs_collected": {
            "files": {
              "collect_list": [
                {
                  "file_path": "/opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log",
                  "log_group_name": "${cloudwatchAgentLogGroup.logGroupName}",
                  "log_stream_name": "{instance_id}-amazon-cloudwatch-agent.log"
                },
                {
                  "file_path": "/var/log/cfn-init.log",
                  "log_group_name": "${cloudwatchAgentLogGroup.logGroupName}",
                  "log_stream_name": "{instance_id}-cfn-init.log"
                },
                {
                  "file_path": "/var/log/cloud-init-output.log",
                  "log_group_name": "${cloudwatchAgentLogGroup.logGroupName}",
                  "log_stream_name": "{instance_id}-cloud-init-output.log"
                }
              ]
            }
          },
          "log_stream_name": "default"
        }
      }
    `;
    const cloudwatchAgentParameter = new ssm.StringParameter(
      this,
      "CloudWatchAgentParameter",
      {
        parameterName: `/AmazonCloudWatch-${this.stackName}/amazon-cloudwatch-agent.json`,
        stringValue: unindent(cloudwatchAgentParameterValue),
      }
    );

    // Create EC2 instance
    const dockerComposeYml = `
      name: postgres
      services:
        postgres:
          image: postgres
          container_name: postgres
          environment:
            POSTGRES_USER: ${dbuser}
            POSTGRES_PASSWORD: ${dbpassword}
            POSTGRES_DB: ${dbname}
            POSTGRES_HOST_AUTH_METHOD: md5
          networks:
            - postgres
          volumes:
            - postgres:/var/lib/postgresql/data
          ports:
            - ${dbport}:${dbport}
          restart: always

      networks:
        postgres:
          name: postgres

      volumes:
        postgres:
          name: postgres
    `;
    const shellCommand = `
      usermod -a -G docker ec2-user
      amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c ssm:${cloudwatchAgentParameter.parameterName}
      su -l ec2-user <<\\EOF
      DOCKER_CONFIG=\${DOCKER_CONFIG:-$HOME/.docker}
      mkdir -p $DOCKER_CONFIG/cli-plugins
      curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
      chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
      cd /tmp
      docker compose up -d
      EOF
    `;
    const instance = new ec2.Instance(this, "EC2Instance", {
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      ssmSessionPermissions: true,
      init: ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ["file", "package", "service", "command"],
        },
        configs: {
          file: new ec2.InitConfig([
            ec2.InitFile.fromString(
              "/tmp/docker-compose.yml",
              unindent(dockerComposeYml)
            ),
          ]),
          package: new ec2.InitConfig([
            ec2.InitPackage.yum("docker"),
            ec2.InitPackage.yum("postgresql15"),
            ec2.InitPackage.yum("amazon-cloudwatch-agent"),
          ]),
          service: new ec2.InitConfig([ec2.InitService.enable("docker")]),
          command: new ec2.InitConfig([
            ec2.InitCommand.shellCommand(unindent(shellCommand), {
              key: "setupCommands",
              ignoreErrors: true,
            }),
          ]),
        },
      }),
      blockDevices: [
        { deviceName: "/dev/sda1", volume: ec2.BlockDeviceVolume.ebs(8) },
      ],
    });
    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")
    );
    instance.connections.allowFromAnyIpv4(ec2.Port.tcp(5432));

    // Create EIP
    const eip = new ec2.CfnEIP(this, "EIP", {
      instanceId: instance.instanceId,
    });
    new cdk.CfnOutput(this, "PsqlCommand", {
      description: "psql command",
      value: `psql -d postgresql://${dbuser}:${dbpassword}@${eip.attrPublicIp}:${dbport}/${dbname}`,
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", {
  stackName: "ec2-docker",
});
