// glue-postgresql.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as glue from "aws-cdk-lib/aws-glue";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dbuser = "postgres";
    const dbpassword = "postgres";
    const dbname = "postgres";
    const dbport = 5432;

    const scriptKey = "main.py";
    const wheelKey = "mypackage-1.0.0-py3-none-any.whl";

    // Create VPC
    const vpc = new ec2.Vpc(this, "VPC", {
      ipAddresses: ec2.IpAddresses.cidr("172.20.0.0/16"),
      restrictDefaultSecurityGroup: false,
      maxAzs: 2,
      reservedAzs: 0,
      natGateways: 1,
      subnetConfiguration: [
        { subnetType: ec2.SubnetType.PUBLIC, name: "Public" },
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: "Private",
        },
      ],
    });

    // Create S3 bucket
    const bucket = new s3.Bucket(this, "Bucket", {
      bucketName: `${this.stackName.toLowerCase()}-bucket-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    new s3deploy.BucketDeployment(this, "GlueJobCode", {
      destinationBucket: bucket,
      sources: [
        s3deploy.Source.asset("./src/dist", { exclude: [".mypy_cache"] }),
      ],
    });

    // Create RDS instance
    const dbInstance = new rds.DatabaseInstance(this, "DBInstance", {
      instanceIdentifier: `${this.stackName}-DBInstance`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_13_13,
      }),
      vpc,
      port: dbport,
      credentials: {
        username: dbuser,
        password: cdk.SecretValue.unsafePlainText(dbpassword),
      },
      databaseName: dbname,
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
    });
    const dbhost = dbInstance.dbInstanceEndpointAddress;

    // // Create EC2 resources
    // const unindent = (text: string, spaces = 6, lines = 1, suffix = "\n") =>
    //   text
    //     .split("\n")
    //     .slice(lines, -lines || undefined)
    //     .map(text => text.replace(new RegExp(`^ {${spaces}}`), ""))
    //     .join("\n") + suffix;

    // const dockerComposeYml = `
    //     name: postgres
    //     services:
    //       postgres:
    //         image: postgres:13
    //         container_name: postgres
    //         environment:
    //           POSTGRES_USER: ${dbuser}
    //           POSTGRES_PASSWORD: ${dbpassword}
    //           POSTGRES_DB: ${dbname}
    //           POSTGRES_HOST_AUTH_METHOD: md5
    //         networks:
    //           - postgres
    //         volumes:
    //           - postgres:/var/lib/postgresql/data
    //         ports:
    //           - ${dbport}:${dbport}
    //         restart: always

    //     networks:
    //       postgres:
    //         name: postgres

    //     volumes:
    //       postgres:
    //         name: postgres
    //   `;
    // const shellCommand = `
    //     usermod -a -G docker ec2-user
    //     su -l ec2-user <<\\EOF
    //     DOCKER_CONFIG=\${DOCKER_CONFIG:-$HOME/.docker}
    //     mkdir -p $DOCKER_CONFIG/cli-plugins
    //     curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
    //     chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
    //     cd /tmp
    //     docker compose up -d
    //     EOF
    //   `;
    // const instance = new ec2.Instance(this, "EC2Instance", {
    //   machineImage: ec2.MachineImage.latestAmazonLinux2023(),
    //   instanceType: ec2.InstanceType.of(
    //     ec2.InstanceClass.T3,
    //     ec2.InstanceSize.MICRO
    //   ),
    //   vpc,
    //   ssmSessionPermissions: true,
    //   init: ec2.CloudFormationInit.fromConfigSets({
    //     configSets: {
    //       default: ["file", "package", "service", "command"],
    //     },
    //     configs: {
    //       file: new ec2.InitConfig([
    //         ec2.InitFile.fromString(
    //           "/tmp/docker-compose.yml",
    //           unindent(dockerComposeYml)
    //         ),
    //       ]),
    //       package: new ec2.InitConfig([
    //         ec2.InitPackage.yum("docker"),
    //         ec2.InitPackage.yum("postgresql15"),
    //       ]),
    //       service: new ec2.InitConfig([ec2.InitService.enable("docker")]),
    //       command: new ec2.InitConfig([
    //         ec2.InitCommand.shellCommand(unindent(shellCommand), {
    //           key: "setupCommands",
    //           ignoreErrors: true,
    //         }),
    //       ]),
    //     },
    //   }),
    //   vpcSubnets: {
    //     subnetType: ec2.SubnetType.PUBLIC,
    //   },
    // });
    // const dbhost = instance.instancePrivateDnsName;

    // Create secret
    const dbSecret = new secretsmanager.Secret(this, "DBSecret", {
      secretName: `${this.stackName}-DBSecret`,
      description: `${this.stackName} DB secret`,
      secretObjectValue: {
        engine: cdk.SecretValue.unsafePlainText("postgres"),
        username: cdk.SecretValue.unsafePlainText(dbuser),
        password: cdk.SecretValue.unsafePlainText(dbpassword),
        host: cdk.SecretValue.unsafePlainText(dbhost),
        port: cdk.SecretValue.unsafePlainText(`${dbport}`),
        dbname: cdk.SecretValue.unsafePlainText(dbname),
      },
    });

    // Create Glue connection
    const glueSecurityGroup = new ec2.SecurityGroup(this, "GlueSecurityGroup", {
      securityGroupName: `${this.stackName}-GlueSecurityGroup`,
      description: `${this.stackName} Glue security group`,
      vpc,
    });
    glueSecurityGroup.connections.allowFrom(
      glueSecurityGroup,
      ec2.Port.allTcp(),
      "Allow all TCP traffic from self-referencing security group"
    );
    dbInstance.connections.allowFrom(
      glueSecurityGroup,
      ec2.Port.tcp(5432),
      "Allow traffic from Glue to RDS instance on port 5432"
    );
    // instance.connections.allowFrom(
    //   glueSecurityGroup,
    //   ec2.Port.tcp(5432),
    //   "Allow traffic from Glue to EC2 instance on port 5432"
    // );
    const glueDbConnection = new glue.CfnConnection(this, "GlueDBConnection", {
      catalogId: this.account,
      connectionInput: {
        name: `${this.stackName}-GlueDBConnection`,
        description: "Glue DB connection",
        connectionType: "JDBC",
        connectionProperties: {
          JDBC_CONNECTION_URL: `jdbc:postgresql://${dbhost}:${dbport}/${dbname}`,
          SECRET_ID: dbSecret.secretArn,
        },
        physicalConnectionRequirements: {
          availabilityZone: vpc.privateSubnets[0].availabilityZone,
          subnetId: vpc.privateSubnets[0].subnetId,
          securityGroupIdList: [glueSecurityGroup.securityGroupId],
        },
      },
    });

    // Create Glue job
    const glueJobPolicy = new iam.ManagedPolicy(this, "GlueJobPolicy", {
      managedPolicyName: `${this.stackName}-GlueJobPolicy-${this.region}`,
      description: "Policy for GlueJob",
      statements: [
        new iam.PolicyStatement({
          sid: "S3ObjectRead",
          actions: ["s3:GetObject"],
          resources: [`${bucket.bucketArn}/*`],
        }),
        new iam.PolicyStatement({
          sid: "SecretsManagerRead",
          actions: ["secretsmanager:GetSecretValue"],
          resources: [dbSecret.secretArn],
        }),
      ],
    });
    const glueJobRole = new iam.Role(this, "GlueJobRole", {
      roleName: `${this.stackName}-GlueJobRole-${this.region}`,
      description: "Service role for GlueJob",
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSGlueServiceRole"
        ),
        glueJobPolicy,
      ],
    });
    const glueJob = new glue.CfnJob(this, "GlueJob", {
      name: `${this.stackName}-GlueJob`,
      description: "this.stackName Glue job",
      role: glueJobRole.roleArn,
      glueVersion: "3.0",
      command: {
        name: "pythonshell",
        pythonVersion: "3.9",
        scriptLocation: `s3://${bucket.bucketName}/${scriptKey}`,
      },
      defaultArguments: {
        "--job-language": "python",
        "--enable-job-insights": "true",
        "--extra-py-files": `s3://${bucket.bucketName}/${wheelKey}`,
        "--DB_SECRET_ARN": dbSecret.secretArn,
        "library-set": "analytics",
      },
      connections: { connections: [glueDbConnection.ref] },
      maxCapacity: 0.0625,
      maxRetries: 0,
      timeout: 1,
    });

    // Create state machine
    const glueSfnTask = new tasks.GlueStartJobRun(this, "GlueSFNTask", {
      glueJobName: glueJob.ref,
      arguments: sfn.TaskInput.fromObject({
        "--CUSTOM_KEY": "value",
      }),
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      taskTimeout: { seconds: 60 },
    });
    new sfn.StateMachine(this, "StateMachine", {
      stateMachineName: `${this.stackName}-StateMachine`,
      comment: `${this.stackName} state machine`,
      definitionBody: sfn.DefinitionBody.fromChainable(glueSfnTask),
    });
  }
}

const app = new cdk.App();
new AppStack(app, "AppStack", {
  stackName: "glue-postgresql",
});
