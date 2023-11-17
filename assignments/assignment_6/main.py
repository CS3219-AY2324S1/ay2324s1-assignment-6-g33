import json
import asyncio
import os
from gql import Client, gql
from gql.transport.aiohttp import AIOHTTPTransport
from datetime import datetime
from pymongo import MongoClient, DESCENDING

leetcode_fetch_limit = os.environ.get('LEETCODE_FETCH_LIMIT')

client = MongoClient(os.environ.get('MONGO_URI'))
db = client['QuestionDB']
collection = db['questions']
largest_id = collection.find_one(sort=[("id", DESCENDING)])["id"]

class QuestionService():
    def __init__(self):
        self.loop = asyncio.new_event_loop()

    async def get_questions_from_leetcode(self):
        transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
        client = Client(transport=transport,
                        fetch_schema_from_transport=False, execute_timeout=None)
        query = gql(
            """query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(
        categorySlug: $categorySlug
        limit: $limit
        skip: $skip
        filters: $filters
    ) {
        total: totalNum
        questions: data {
        difficulty
        title
        frontendQuestionId: questionFrontendId
        titleSlug
        topicTags {
            name
            id
            slug
        }
        }
    }
    }
    """
        )

        result = await client.execute_async(
            query, {"categorySlug": "", "skip": largest_id,
                    "limit": leetcode_fetch_limit, "filters": {}}
        )
        remapped_questions = []
        for question in dict(result)["problemsetQuestionList"]["questions"]:
            content_query = gql("""
                query questionContent($titleSlug: String!) {
                    question(titleSlug: $titleSlug) {
                        content
                        mysqlSchemas
                    }
            }""")
            content_transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
            content_client = Client(transport=content_transport,
                fetch_schema_from_transport=False, execute_timeout=None)
            content_result = await content_client.execute_async(
                content_query, {"titleSlug":  question["titleSlug"]}
            )
            if content_result.get("question"):
                question["problem"] = content_result.get("question").get("content")

            # Desired keys
            # question_schema = {
            #    "id": {"type": "Number"},
            #    "title": {"type": "String"},
            #    "description": {"type": "String"},
            #    "categories": {"type": "Array"},
            #    "complexity": {"type": "String"},
            # }
            
            # Define mapping between original keys and desired keys
            mapping = {
                "id": "frontendQuestionId",
                "title": "title",
                "description": "problem",
                "categories": "topicTags",
                "complexity": "difficulty",
            }

            categories = [tag['name'] for tag in question.get("topicTags", [])]

            remapped_question = {original_key: categories if mapped_key == "topicTags" else question.get(mapped_key) for original_key, mapped_key in mapping.items()}
            remapped_questions.append(remapped_question)

        collection.insert_many(remapped_questions)
        # print("inserted:")
        # print(remapped_questions)

def lambda_handler(event, context):
    asyncio.run(QuestionService().get_questions_from_leetcode())
    return {
        'statusCode': 200,
        'body': 'Questions fetched successfully'  # Adjust response as needed
    }

if __name__ == "__main__":
    asyncio.run(QuestionService().get_questions_from_leetcode())
    
