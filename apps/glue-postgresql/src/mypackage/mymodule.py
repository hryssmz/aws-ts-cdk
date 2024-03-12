import json
from urllib.parse import quote

import boto3
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


def get_secret_string(secret_id: str) -> str:
    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=secret_id)
    secret_string: str = response["SecretString"]
    return secret_string


def create_db_engine(db_secret_arn: str) -> Engine:
    db_secret = json.loads(get_secret_string(db_secret_arn))
    url = "postgresql+psycopg2://{}:{}@{}:{}/{}".format(
        quote(db_secret["username"], safe=""),
        quote(db_secret["password"], safe=""),
        db_secret["host"],
        db_secret["port"],
        quote(db_secret["dbname"], safe=""),
    )
    engine = create_engine(url)
    return engine
