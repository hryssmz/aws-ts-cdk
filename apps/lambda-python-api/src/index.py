import json
import logging
import os

from aws_lambda_typing.context import Context
from aws_lambda_typing.events import APIGatewayProxyEventV1
from aws_lambda_typing.responses import APIGatewayProxyResponseV1


def handler(
    event: APIGatewayProxyEventV1, context: Context
) -> APIGatewayProxyResponseV1:
    logger = get_logger(context.function_name)
    logger.info(json_serialize(event))
    logger.info(json_serialize(dict(os.environ)))
    body = {"message": "Hello World!"}
    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json_serialize(body),
    }


def json_serialize(obj: object) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False)


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    return logger
