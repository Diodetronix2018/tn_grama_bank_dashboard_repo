"""Entry point when this runs on AWS Lambda behind API Gateway.

Local development and CI never import this file -- they run
`uvicorn app.main:app` directly. This wrapper only exists for the deployed
path (see template.yaml).
"""

from mangum import Mangum

from app.main import app

handler = Mangum(app)
