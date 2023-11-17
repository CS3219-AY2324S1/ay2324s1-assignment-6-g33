#!/bin/bash

env $(cat .env | grep -v '^#' | xargs) python3 main.py