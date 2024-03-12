import os
import sys

from sqlalchemy import text

from awsglue.utils import getResolvedOptions  # type: ignore
from mypackage.mymodule import create_db_engine


def main(args: dict[str, str]) -> None:
    print(args)
    db_secret_arn = os.environ["DB_SECRET_ARN"]
    engine = create_db_engine(db_secret_arn)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1;"))
        print(result.all())


if __name__ == "__main__":
    env_keys = ["DB_SECRET_ARN"]
    for k, v in getResolvedOptions(sys.argv, env_keys).items():
        os.environ[k] = v
    arg_keys = ["CUSTOM_KEY"]
    args = getResolvedOptions(sys.argv, arg_keys)
    main(args)
