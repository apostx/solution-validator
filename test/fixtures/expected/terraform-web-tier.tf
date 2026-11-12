terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

provider "aws" {}

resource "aws_s3_bucket" "assets" {
  bucket = "assets"
}

resource "aws_s3_bucket_public_access_block" "assets_public_access" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_vpc" "vpc" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.vpc.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.vpc.id
  cidr_block = "10.0.2.0/24"
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.vpc.id
}

resource "aws_vpc_endpoint" "ddb-endpoint" {
  vpc_id            = aws_vpc.vpc.id
  vpc_endpoint_type = "Gateway"
}

resource "aws_route_table" "public-rt" {
  vpc_id = aws_vpc.vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "public-rt_association_public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public-rt.id
}

resource "aws_route_table" "private-rt" {
  vpc_id = aws_vpc.vpc.id
}

resource "aws_route_table_association" "private-rt_association_private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private-rt.id
}

resource "aws_lb" "alb" {
  name               = "alb"
  load_balancer_type = "application"
  internal           = false
  subnets            = [aws_subnet.public.id]
  security_groups    = [aws_security_group.alb-sg.id]
}

resource "aws_security_group" "alb-sg" {
  name   = "alb-sg"
  vpc_id = aws_vpc.vpc.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.app-sg.id]
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "app"
  vpc_zone_identifier = [aws_subnet.private.id]
}

resource "aws_security_group" "app-sg" {
  name   = "app-sg"
  vpc_id = aws_vpc.vpc.id

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb-sg.id]
  }

  egress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.db-sg.id]
  }
}

resource "aws_db_instance" "db" {
  identifier             = "db"
  engine                 = "postgres"
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.db-sg.id]
}

resource "aws_security_group" "db-sg" {
  name   = "db-sg"
  vpc_id = aws_vpc.vpc.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app-sg.id]
  }
}

resource "aws_lambda_function" "worker" {
  function_name = "worker"

  vpc_config {
    subnet_ids         = [aws_subnet.private.id]
    security_group_ids = [aws_security_group.worker-sg.id]
  }
}

resource "aws_security_group" "worker-sg" {
  name   = "worker-sg"
  vpc_id = aws_vpc.vpc.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_dynamodb_table" "orders" {
  name = "orders"
}

resource "aws_dynamodb_table" "reports" {
  name = "reports"
}
