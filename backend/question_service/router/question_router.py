from fastapi import APIRouter, Depends, HTTPException
from database.mongodb import AsyncIOMotorClient, get_database
from config import get_config, get_producer
from gql import Client, gql
from gql.transport.aiohttp import AIOHTTPTransport
import json
from model.question import Question
from model.judge import Submission
from database.question_collection import (
    fetch_all_questions,
    fetch_one_question,
    delete_all_questions,
    delete_one_question,
    create_question,

)
from database.submision_collection import (
    get_all_submission_from_question,
    add_one_submission,
    remove_all_submissions
)


router = APIRouter(
    prefix="/api/v1/question",
    tags=["question"],
    responses={404: {"description": "Not found"}},
)

config = get_config()


@router.get("")
async def get_questions(db: AsyncIOMotorClient = Depends(get_database)):
    response = await fetch_all_questions(db)
    return response


@router.get("/title/{title}", response_model=Question)
async def get_question_by_title(title, db: AsyncIOMotorClient = Depends(get_database)):
    response = await fetch_one_question(db, title)
    if response:
        return response
    raise HTTPException(404, f"There is no question with the name {title}")

@router.get("/problem")
async def get_question_problem(titleSlug: str):
    transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
    client = Client(transport=transport, fetch_schema_from_transport=False)
    query = gql("""
                    query questionContent($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
    content
    mysqlSchemas
    }
}""")
    result = await client.execute_async(
        query, {"titleSlug":  titleSlug}
    )
    if result.get("question") is None:
        return "Question not found"
    return result.get("question").get("content")

@router.get("/solution/official")
async def get_official_solution(titleSlug: str):
    transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
    client = Client(transport=transport, fetch_schema_from_transport=False)
    query = gql("""query officialSolution($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    solution {
      id
      title
      content
      contentTypeId
      paidOnly
      hasVideoSolution
      paidOnlyVideo
      canSeeDetail
      rating {
        count
        average
        userRating {
          score
        }
      }
      topic {
        id
        commentCount
        topLevelCommentCount
        viewCount
        subscribed
        solutionTags {
          name
          slug
        }
        post {
          id
          status
          creationDate
          author {
            username
            isActive
            profile {
              userAvatar
              reputation
            }
          }
        }
      }
    }
  }
}""")
    result = await client.execute_async(
        query, {"titleSlug":  titleSlug}
    )

    if result.get("question") is None:
        return "Question not found"
    if result.get("question").get("solution") is None:
        return "Solution does not exist"
    return result.get("question").get("solution")

@router.get("/solution/community/list")
async def get_community_solutions(titleSlug: str, language: str):
    transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
    client = Client(transport=transport, fetch_schema_from_transport=False)
    query = gql("""query communitySolutions($questionSlug: String!, $skip: Int!, $first: Int!, $query: String, $orderBy: TopicSortingOption, $languageTags: [String!], $topicTags: [String!]) {
  questionSolutions(
    filters: {questionSlug: $questionSlug, skip: $skip, first: $first, query: $query, orderBy: $orderBy, languageTags: $languageTags, topicTags: $topicTags}
  ) {
    hasDirectResults
    totalNum
    solutions {
      id
      title
      commentCount
      topLevelCommentCount
      viewCount
      pinned
      isFavorite
      solutionTags {
        name
        slug
      }
      post {
        id
        status
        voteCount
        creationDate
        isHidden
        author {
          username
          isActive
          nameColor
          activeBadge {
            displayName
            icon
          }
          profile {
            userAvatar
            reputation
          }
        }
      }
      searchMeta {
        content
        contentType
        commentAuthor {
          username
        }
        replyAuthor {
          username
        }
        highlights
      }
    }
  }
}""")
    result = await client.execute_async(
        query, {"languageTags": language, "topicTags": [], "questionSlug": titleSlug, "skip": 0, "first": 15, "orderBy": "hot"}
    )
    return result.get("questionSolutions").get("solutions")

@router.get("/solution/community")
async def get_community_solutions(id: int):
  try:
    transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
    client = Client(transport=transport, fetch_schema_from_transport=False)
    query = gql("""query communitySolution($topicId: Int!) {
  topic(id: $topicId) {
    id
    viewCount
    topLevelCommentCount
    subscribed
    title
    pinned
    solutionTags {
      name
      slug
    }
    hideFromTrending
    commentCount
    isFavorite
    post {
      id
      voteCount
      voteStatus
      content
      updationDate
      creationDate
      status
      isHidden
      author {
        isDiscussAdmin
        isDiscussStaff
        username
        nameColor
        activeBadge {
          displayName
          icon
        }
        profile {
          userAvatar
          reputation
        }
        isActive
      }
      authorIsModerator
      isOwnPost
    }
  }
}""")
    result = await client.execute_async(
        query, {"topicId": id}
    )
    return result.get("topic")
  except Exception as e:
      return e.errors



@router.get("/exampletestcase")
async def get_testcase(titleSlug: str):
    transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
    client = Client(transport=transport, fetch_schema_from_transport=False)
    query = gql("""query consolePanelConfig($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    questionTitle
    enableDebugger
    enableRunCode
    enableSubmit
    enableTestMode
    exampleTestcaseList
    metaData
  }
}
                   """)
    result = await client.execute_async(
        query, {"titleSlug":  titleSlug}
    )
    if result.get("question") is None:
        return "Question not found"
    return result.get("question").get("exampleTestcaseList")
    
@router.get("/codesnippets")
async def get_code_snippets(titleSlug: str) -> list:
    transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
    client = Client(transport=transport, fetch_schema_from_transport=False)
    query = gql("""  query questionEditorData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    codeSnippets {
      lang
      langSlug
      code
    }
    envInfo
    enableRunCode
  }
}
                   """)
    result = await client.execute_async(
        query, {"titleSlug":  titleSlug}
    )
    if result.get("question") is None:
        return "Question not found"
    return result.get("question").get("codeSnippets")


@router.delete("/title/{title}")
async def delete_question(title, db: AsyncIOMotorClient = Depends(get_database)):
    question = await fetch_one_question(db, title)
    if not question:
        raise HTTPException(400, f"Question {title} does not exist")
    response = await delete_one_question(db, title)
    if response:
        return "Successfully deleted question"


@router.delete("")
async def delete_questions(db: AsyncIOMotorClient = Depends(get_database)):
    response = await delete_all_questions(db)
    if response:
        return "Successfully deleted all questions"
    raise HTTPException(500, "Something went wrong")


@router.post("/leetcode")
async def add_questions_from_leetcode():
    producer = get_producer()
    producer.produce(config.kafka_topic_question_service, json.dumps("GET QUESTIONS FROM LEETCODE"))
    producer.flush()
    return "Successfully added questions from Leetcode"

@router.post("")
async def add_one_question(question: Question, db: AsyncIOMotorClient = Depends(get_database)):
    try:
        result = await create_question(db, question.dict())
        return result
    except Exception as e:
        return e


@router.get("/day")
async def get_question_of_the_day():
    transport = AIOHTTPTransport(url="https://leetcode.com/graphql")
    client = Client(transport=transport, fetch_schema_from_transport=False)
    query = gql("""query questionOfToday {
  activeDailyCodingChallengeQuestion {
    date
    userStatus
    link
    question {
      acRate
      difficulty
      freqBar
      frontendQuestionId: questionFrontendId
      isFavor
      paidOnly: isPaidOnly
      status
      title
      titleSlug
      hasVideoSolution
      hasSolution
      topicTags {
        name
        id
        slug
      }
    }
  }
}""")
    r1 = await client.execute_async(
            query
        )
    query = gql("""query questionContent($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
        content
        mysqlSchemas
    }
    }""")
    r2 = await client.execute_async(
        query, {"titleSlug":  r1["activeDailyCodingChallengeQuestion"]["question"]["titleSlug"]})
    r1["activeDailyCodingChallengeQuestion"]["question"]["problem"] = r2["question"]["content"]
    return Question(**r1["activeDailyCodingChallengeQuestion"]["question"])
   

@router.get("/history")
async def get_submissions_from_question(userID:str, titleSlug:str, db: AsyncIOMotorClient = Depends(get_database)):
    response = await get_all_submission_from_question(db, userID, titleSlug)
    return response

@router.post("/history")
async def add_submission_to_db(submission: Submission, db: AsyncIOMotorClient = Depends(get_database)):
    try:
      response = await add_one_submission(db, submission.dict())
      return response
    except Exception as e:
        print(e)

@router.delete("/history")
async def delete_all_submissions_from_db(db: AsyncIOMotorClient = Depends(get_database)):
    return await remove_all_submissions(db)

