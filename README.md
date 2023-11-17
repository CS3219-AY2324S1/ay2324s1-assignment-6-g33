[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-24ddc0f5d75046c5622901739e7c5dd533143b0c8e959d652212380cedb1ea36.svg)](https://classroom.github.com/a/UxpU_KWG)

# Serverless leetcode fetcher

This serverless function will pull 2 questions (configurable) from leetcode service and insert into the mongodb that is in Assignment 4.

It uses the same mongodb as Assignment 4. Running Assignment 4 services will allow the user to see changes in the mongodb with a nicer frontend

# Serverless deployment instruction

Prerequisite [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

```bash
aws configure # enter your AWS IAM Credentials
cd assignments/assignment_6/
npm install -g serverless
serverless plugin install --name serverless-python-requirements
serverless
```

It prompt a CLI tool. 
First question will ask you to login into Serverless Dashboard (N)
Second question will ask if you want to deploy (Y)

Then it will deploy and provide the endpoint

![image](https://github.com/CS3219-AY2324S1/ay2324s1-assignment-6-g33/assets/24467184/46f21bea-ada2-4c85-a8d6-afc551a13528)
