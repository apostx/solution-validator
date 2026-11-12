terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

provider "aws" {}

variable "ami" {
  type        = string
  description = "The machine image (AMI) of EC2 instances."
}

variable "instance_type" {
  type        = string
  description = "The EC2 instance type, for example t3.micro."
}

resource "aws_vpc" "vpc" {
  cidr_block      = "10.0.0.0/16"
  ipv6_cidr_block = "2600:1f18:1234:5600::/56"
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.vpc.id
  cidr_block        = "10.0.1.0/24"
  ipv6_cidr_block   = "2600:1f18:1234:5601::/64"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.vpc.id
  cidr_block        = "10.0.2.0/24"
  ipv6_cidr_block   = "2600:1f18:1234:5602::/64"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "legacy" {
  vpc_id            = aws_vpc.vpc.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.vpc.id
}

resource "aws_egress_only_internet_gateway" "eigw" {
  vpc_id = aws_vpc.vpc.id
}

resource "aws_route_table" "public-rt" {
  vpc_id = aws_vpc.vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  route {
    ipv6_cidr_block = "::/0"
    gateway_id      = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "public-rt_association_public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public-rt.id
}

resource "aws_route_table" "private-rt" {
  vpc_id = aws_vpc.vpc.id

  route {
    ipv6_cidr_block        = "::/0"
    egress_only_gateway_id = aws_egress_only_internet_gateway.eigw.id
  }
}

resource "aws_route_table_association" "private-rt_association_private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private-rt.id
}

resource "aws_route_table_association" "private-rt_association_legacy" {
  subnet_id      = aws_subnet.legacy.id
  route_table_id = aws_route_table.private-rt.id
}

resource "aws_instance" "web" {
  ami                         = var.ami
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.web-sg.id]
  associate_public_ip_address = true
}

resource "aws_instance" "worker" {
  ami                         = var.ami
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.private.id
  vpc_security_group_ids      = [aws_security_group.worker-sg.id]
  associate_public_ip_address = false
}

resource "aws_instance" "batch" {
  ami                         = var.ami
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.legacy.id
  vpc_security_group_ids      = [aws_security_group.worker-sg.id]
  associate_public_ip_address = false
}

resource "aws_s3_bucket" "bucket" {
  bucket = "bucket"
}

resource "aws_s3_bucket_public_access_block" "bucket_public_access" {
  bucket                  = aws_s3_bucket.bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_security_group" "web-sg" {
  name   = "web-sg"
  vpc_id = aws_vpc.vpc.id

  ingress {
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
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
