import {
    memo,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { QuestionContext } from "../contexts/QuestionContext";
import Editor from "@monaco-editor/react";
import { socket } from "../components/services/WebSocket";
import { MatchContext } from "../contexts/MatchContext";
import { ProblemContext } from "../contexts/ProblemContext";
import axios from "axios";
import ConsoleButton from "../components/common/question/ConsoleButton";
import ProblemPageTabs from "../components/common/question/ProblemPageTabs";
import SnackBar from "../components/common/SnackBar";
import { SnackBarContext } from "../contexts/SnackBarContext";
import ConsoleTabs from "../components/common/question/ConsoleTabs";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import "../css/problemPage.scss";
import { defineTheme } from "../utils/helper";
import EditorOptions from "../components/common/question/EditorOptions";
import ResizeBar from "../components/common/ResizeBar";
import { FirebaseContext } from "../contexts/FirebaseContext";
import VideoCall from "../components/services/VideoCall";
import { unstable_useBlocker, useNavigate } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { Box, Modal, Typography, Button } from "@mui/material";
import CustomSelect from "../components/common/question/CustomSelect";
import { API_GATEWAY, EDITOR_SUPPORTED_LANGUAGES, SOCKET_URL } from "./../utils/constants";

var interval_id = null;
var timeout_id = null;

function ProblemPage(props) {
    const { type } = props;
    const {
        currentUser: { uid },
        currentName,
    } = useContext(FirebaseContext);
    const { question } = useContext(QuestionContext);
    const { match, quitMatch, setQuitMatch } = useContext(MatchContext);
    const {
        message,
        aiMessage,
        code,
        language,
        snippets,
        setLanguage,
        setCode,
        setAIMessage,
        setMessage,
        setConsoleResult,
    } = useContext(ProblemContext);
    const { openSnackBar, setOpenSnackBar, sb, setSB } =
        useContext(SnackBarContext);
    const [hide, setHide] = useState(true);
    const [textInput, setTextInput] = useState("");
    const [aiTextInput, setAITextInput] = useState("");
    //eslint-disable-next-line
    const [aiLoading, setAILoading] = useState(false);
    const [chatHeight, setChatHeight] = useState(100);
    const [editorTheme, setEditorTheme] = useState({
        name: "vs-dark",
        value: "vs-dark",
        key: "vs-dark",
    });
    const [defaultTestCases, setDefaultTestCases] = useState([]);
    const [testCase, setTestCase] = useState({});
    const [stdin, setStdin] = useState();
    const [isRunning, setIsRunning] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isBatch, setIsBatch] = useState(false);
    const [batchSubmission, setBatchSubmission] = useState([]);
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const containerRef = useRef(null);
    const interval_ids = useRef({});
    const timeout_ids = useRef({});
    const navigate = useNavigate();

    const translatedEditorRef = useRef(null);
    const translatedMonacoRef = useRef(null);

    const [showCodeTranslate, setShowCodeTranslate] = useState(false);
    const [translatedCode, setTranslatedCode] = useState("");
    const [translateToLanguage, setTranslateToLanguage] = useState({
        id: 63,
        name: "JavaScript (Node.js 12.14.0)",
        raw: "javascript",
    });

    function handleTranslatedEditorDidMount(editor, monaco) {
        translatedEditorRef.current = editor;
        translatedMonacoRef.current = monaco;
    }

    const handleEditorDidMount = useCallback(
        (editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
            try {
                editorRef.current.getModel().updateOptions({
                    tabSize: 8,
                });
            } catch (e) {
                console.log(e);
            }
        },
        //eslint-disable-next-line
        []
    );
    useEffect(() => {
        setCode(
            snippets?.find((snippet) => {
                return snippet?.langSlug === language.raw;
            })?.code
        );
        //eslint-disable-next-line
    }, []);

    const handleCloseSnackBar = useCallback((event, reason) => {
        if (reason === "clickaway") {
            return;
        }
        setOpenSnackBar(false);
        //eslint-disable-next-line
    }, []);

    // function getCursorPos() {
    //   console.log(editorRef.current.getPosition()); //get current position useful to show peer where you are currently at
    // }
    const onHide = useCallback(() => {
        setHide(true);
        setChatHeight(100);
    }, []);
    const onShow = useCallback(() => {
        setHide(false);
        setChatHeight(60);
    }, []);

    const getExpectedOutput = useCallback(() => {
        return question?.problem
            .split("\n")
            .map((line) => {
                if (line?.toString().toLowerCase().indexOf("output") !== -1) {
                    return line
                        ?.substring(line.indexOf("</strong>") + 9)
                        .trim();
                }
                return null;
            })
            .filter((element) => {
                return element !== null;
            });
    }, [question.problem]);

    useEffect(() => {
        //get Test case here once
        getDefaultTestCases();
        return () => {
            clearInterval(interval_id);
            clearTimeout(timeout_id);
        };
        //eslint-disable-next-line
    }, []);
    useEffect(() => {
        try {
            if (testCase) {
                const arr = Object.keys(testCase)
                    ?.filter((key) => key !== "output")
                    ?.map((key) => {
                        return { [key]: testCase[key] };
                    });
                if (arr.length > 0) {
                    const obj = Object.assign(...arr);
                    setStdin(obj);
                }
            }
        } catch (e) {
            console.log(e);
        }
    }, [testCase]);

    useEffect(() => {
        if (chatHeight >= 100) {
            setHide(true);
        }
    }, [chatHeight]);

    const updateQuestionStatus = useCallback(
        async (description) => {
            const data = {
                userID: uid,
                titleSlug: question.titleSlug,
                description: description,
            };

            await axios.put(
                API_GATEWAY + `/api/v1/question-status`,
                data
            );
        },
        [question.titleSlug, uid]
    );

    useEffect(() => {
        // Priority Error > WA > TLE > AC
        if (
            batchSubmission.length === defaultTestCases.length &&
            batchSubmission.length > 0 &&
            isSubmitting
        ) {
            const errorIndex = batchSubmission.findIndex(
                (feedback) =>
                    feedback.status.description
                        .toLowerCase()
                        .indexOf("error") !== -1
            );
            const WrongIndex = batchSubmission.findIndex(
                (feedback) => feedback.status.id === 4
            );
            const TLEIndex = batchSubmission.findIndex(
                (feedback) => feedback.status.id === 5
            );

            if (errorIndex !== -1) {
                postHistory(batchSubmission[errorIndex]);
                updateQuestionStatus("Error");
            } else if (WrongIndex !== -1) {
                postHistory(batchSubmission[WrongIndex]);
                updateQuestionStatus("Wrong Answer");
            } else if (TLEIndex !== -1) {
                postHistory(batchSubmission[TLEIndex]);
                updateQuestionStatus("Time Limit Exceeded");
            } else {
                postHistory(batchSubmission[0]);
                updateQuestionStatus("Completed");
            }
            setIsSubmitting(false);
        }
        //eslint-disable-next-line
    }, [batchSubmission]);

    const onBlockNav = () => {
        if (match) {
            setSB({
                msg: "Please request to leave the session",
                severity: "error",
            });

            setOpenSnackBar(true);
        }
        return match;
    };

    if (type === "coop") {
        unstable_useBlocker(onBlockNav);
    }
    useEffect(() => {
        if (quitMatch) {
            navigate("/dashboard");
            setQuitMatch(false);
        }
        //eslint-disable-next-line
    }, [quitMatch]);

    const onSubmitChat = useCallback(
        (e) => {
            if (e.keyCode === 13) {
                let date = new Date();
                const time = `${date.getHours()}:${String(
                    date.getMinutes()
                ).padStart(2, "0")}`;
                let currentMessage = [...message];
                currentMessage.push({
                    user: "me",
                    data: e.target.value,
                    time: time,
                });
                setMessage(currentMessage);
                socket.emit("room-message", match, {
                    user: currentName,
                    data: e.target.value,
                    time: time,
                });
                setTextInput("");
            }
        },
        //eslint-disable-next-line
        [message, match]
    );

    const onSubmitAIChat = useCallback(
        async (e) => {
            if (e.keyCode === 13) {
                setAILoading(true);
                let currentMessage = [...aiMessage];
                const prompt = e.target.value;
                currentMessage.push({
                    role: "user",
                    content: prompt,
                });
                setAIMessage(currentMessage);
                setAITextInput("AI is replying...");
                await axios
                    .post(SOCKET_URL.slice(0, -4) + "8020/ask", { prompt })
                    .then((res) => {
                        let result = res.data;
                        for (var i = 0; i < 2; i++) {
                            result = result.replace("\n", "");
                        }
                        currentMessage.push({
                            role: "system",
                            content: result,
                        });
                    })
                    .catch((error) => console.log(error));
                setAIMessage(currentMessage);
                setAITextInput("");
                setAILoading(false);
            }
        },
        [aiMessage, setAIMessage]
    );

    const getSubmission = useCallback(
        (token) => {
            interval_id = setInterval(async () => {
                const { data } = await axios.get(
                    API_GATEWAY + `/api/v1/judge/submission?token=${token}`
                );
                if (data.status.id !== 1 && data.status.id !== 2) {
                    clearInterval(interval_id);
                    clearTimeout(timeout_id);
                    const feedback = {
                        stdout: data.stdout ? atob(data.stdout) : "None",
                        time: data.time,
                        memory: data.memory,
                        stderr: data.stderr ? atob(data.stderr) : "None",
                        compile_output: data.compile_output
                            ? atob(data.compile_output)
                            : "None",
                        message: data.message ? atob(data.message) : "None",
                        status: data.status,
                    };
                    if (type === "coop") {
                        socket.emit("code-submission", match, feedback);
                    }
                    setConsoleResult(feedback);
                    setSB({ msg: "Code Submitted", severity: "success" });
                    setOpenSnackBar(true);
                    setIsRunning(false);
                }
            }, 2000);
        },
        //eslint-disable-next-line
        [match, type]
    );

    const postSubmission = useCallback(
        async (stdin, output) => {
            return await axios.post(
                API_GATEWAY + "/api/v1/judge/submission",
                {
                    userID: uid,
                    titleSlug: question["titleSlug"],
                    language_id: language.id,
                    source_code: btoa(code),
                    stdin: btoa(JSON.stringify(stdin)),
                    expected_output: btoa(output?.toString()),
                }
            );
        },
        [code, language.id, question, uid]
    );
    const postHistory = useCallback(
        async (feedback) => {
            try {
                const data = {
                    submission: {
                        userID: uid,
                        titleSlug: question["titleSlug"],
                        language_id: language.id,
                        source_code: code,
                    },
                    feedback,
                };
                await axios.post(
                    API_GATEWAY + `/api/v1/question/history`,
                    data
                );
            } catch (e) {
                console.log(e);
            }
        },
        [code, language.id, question, uid]
    );
    //Submit Button to run against all default test cases
    //Submit Button to run against all default test cases
    const onSubmit = () => {
        try {
            setBatchSubmission([]);
            setConsoleResult("");
            const outputs = getExpectedOutput();
            defaultTestCases?.forEach(async (tc, index) => {
                const response = await postSubmission(tc, outputs[index]); //post submission to judge0 and poll 10s for feedback
                timeout_ids.current[index] = setTimeout(() => {
                    clearInterval(interval_ids.current[index]);
                }, 10000);
                interval_ids.current[index] = setInterval(async () => {
                    const { data } = await axios.get(
                        API_GATEWAY + `/api/v1/judge/submission?token=${response.data.token}`
                    );
                    if (data.status.id !== 1 && data.status.id !== 2) {
                        //if submission is ready stop polling
                        const feedback = {
                            token: response.data.token,
                            stdout: data.stdout ? atob(data.stdout) : "None",
                            time: data.time,
                            memory: data.memory,
                            stderr: data.stderr ? atob(data.stderr) : "None",
                            compile_output: data.compile_output
                                ? atob(data.compile_output)
                                : "None",
                            message: data.message ? atob(data.message) : "None",
                            status: data.status,
                            finished_at: data?.finished_at,
                            expected_output: outputs[index],
                        };
                        setBatchSubmission((prevState) => [
                            ...prevState,
                            feedback,
                        ]);
                        clearInterval(interval_ids.current[index]);
                        clearTimeout(timeout_ids.current[index]);
                    }
                }, 2000);
            });
            setIsBatch(true); //change Result tab content to 'Batch' instead of 'Single'
            setIsSubmitting(true);
        } catch (e) {
            console.log(e.message);
        }
    };

    const handleLanguageChange = useCallback(
        (event) => {
            setLanguage(JSON.parse(event.target.value));
            if (type === "coop") {
                socket.emit("code-language", match, event.target.value);
            }
            setCode(
                snippets?.find((snippet) => {
                    return (
                        snippet.langSlug === JSON.parse(event.target.value).raw
                    );
                })?.code
            );
        },
        //eslint-disable-next-line
        [type, match, snippets]
    );
    const handleThemeChange = useCallback((event) => {
        const theme = JSON.parse(event.target.value);
        if (["light", "vs-dark"].includes(theme.name)) {
            setEditorTheme(theme);
        } else {
            defineTheme(theme.value).then((_) => setEditorTheme(theme));
        }
    }, []);

    //Run button to run against user selected testcase
    const onRun = useCallback(async () => {
        try {
            const { data } = await postSubmission(stdin, testCase?.output);
            setIsRunning(true);
            timeout_id = setTimeout(() => {
                clearInterval(interval_id);
                setSB({ msg: "Submission timedout", severity: "error" });
                setOpenSnackBar(true);
                setIsRunning(false);
            }, 10000);
            setIsBatch(false);
            getSubmission(data.token);
        } catch (e) {
            console.log(e.message);
        }
        //eslint-disable-next-line
    }, [stdin, testCase, code, language.id, question.titleSlug, uid]);

    const handleCodeChanges = useCallback(
        (code) => {
            setCode(code);
            if (type === "coop") {
                socket.emit("code-changes", match, code);
            }
        },
        //eslint-disable-next-line
        [match, type]
    );

    const handleLeaveRoom = useCallback(() => {
        if (type === "coop") {
            socket.emit("match-quit", match);
            setSB({ msg: "Requested to quit session...", severity: "success" });
            setOpenSnackBar(true);
        }
        //eslint-disable-next-line
    }, [match, type]);

    const getDefaultTestCases = async () => {
        try {
            const { data } = await axios.get(
                API_GATEWAY + `/api/v1/question/exampletestcase`,
                {
                    params: { titleSlug: question?.titleSlug },
                }
            );
            const testcases = data?.testCases?.map((tc) => {
                const arr = tc?.split("\n")?.map((param, index) => {
                    return {
                        [JSON.parse(data?.metaData)?.params[index]?.name]:
                            param,
                    };
                });
                return Object.assign(...arr);
            });
            const expected = getExpectedOutput();
            testcases?.map((tc, index) => {
                return (tc["output"] = expected[index]);
            });
            setDefaultTestCases(testcases);
            setTestCase(testcases?.at(0) || {});
        } catch (e) {
            console.log(e);
        }
    };

    function generateCodeTranslatePrompt(inputLanguage, outputLanguage) {
        let prompt = `You are an expert programmer in all programming languages. Translate the "${inputLanguage}" code to "${outputLanguage}" code. Do not include \`\`\`.
  
    Example translating from JavaScript to Python:

    JavaScript code:
    for (let i = 0; i < 10; i++) {
      console.log(i);
    }

    Python code:
    for i in range(10):
      print(i)
    
    ${inputLanguage} code:
    ${code}

    ${outputLanguage} code (no \`\`\`):`;
        return prompt;
    }

    const onCodeTranslationRequest = async (e) => {
        if (translateToLanguage === "") {
            setSB({
                msg: "Please input a coding language to translate to!",
                severity: "error",
            });
            setOpenSnackBar(true);
            return;
        }
        let prompt = generateCodeTranslatePrompt(
            language.raw,
            translateToLanguage.raw
        );
        await axios
            .post(SOCKET_URL.slice(0, -4) + "8020/ask", { prompt })
            .then((res) => {
                if (res.status === 200) {
                    if (res.data.includes("maximum context length")) {
                        setSB({
                            msg: "You have exceeded the maximum prompt length, please shorten your prompt!",
                            severity: "error",
                        });
                        setOpenSnackBar(true);
                    } else {
                        setSB({
                            msg: "Translation of code successful!",
                            severity: "success",
                        });
                        setOpenSnackBar(true);
                        setTranslatedCode(res.data);
                    }
                }
            })
            .catch((error) => console.log(error));
    };

    function onCodeTranslateQuery() {
        setShowCodeTranslate(true);
    }

    function onCodeTranslateConfirmation() {
        setLanguage(translateToLanguage);
        setCode(translatedCode);
        setTranslatedCode("");
        handleClose();
    }

    function handleTranslateLanguageChange(event) {
        setTranslateToLanguage(JSON.parse(event.target.value));
    }

    function handleTranslatedCodeChanges(translatedCode) {
        setTranslatedCode(translatedCode);
    }

    const style = {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "70%",
        height: "70%",
        bgcolor: "white",
        border: "2px solid #000",
        boxShadow: 24,
        p: 2,
    };

    let theme = createTheme({
        shape: {
            pillRadius: 50,
        },
    });

    const handleClose = () => setShowCodeTranslate(false);

    return (
        <>
            <SnackBar
                msg={sb?.msg}
                handleCloseSnackBar={handleCloseSnackBar}
                openSnackBar={openSnackBar}
                severity={sb?.severity}
            />

            {showCodeTranslate && (
                <Modal
                    open={showCodeTranslate}
                    onClose={handleClose}
                    aria-labelledby="modal-modal-title"
                    aria-describedby="modal-modal-description"
                >
                    <Box sx={style}>
                        <CustomSelect
                            title={"Language"}
                            list={EDITOR_SUPPORTED_LANGUAGES}
                            value={translateToLanguage}
                            handleChange={handleTranslateLanguageChange}
                        />
                        <Typography
                            id="modal-modal-title"
                            variant="body1"
                            component="h5"
                            sx={{ marginTop: 1, marginBottom: 1 }}
                        >
                            Translate your current code here from{" "}
                            {language.name} to {translateToLanguage.name}
                        </Typography>

                        <ThemeProvider theme={theme}>
                            <Button
                                variant="contained"
                                pill
                                onClick={onCodeTranslationRequest}
                            >
                                TRANSLATE
                            </Button>
                        </ThemeProvider>

                        <div className="translator-container">
                            <div className="translator-component">
                                <h3>Original Code</h3>
                                <Editor
                                    height="80%"
                                    language={language?.raw}
                                    theme={editorTheme?.value}
                                    value={code}
                                    onChange={handleCodeChanges}
                                    onMount={handleEditorDidMount}
                                    options={{
                                        dragAndDrop: false,
                                        inlineSuggest: true,
                                        fontSize: "16px",
                                        formatOnType: true,
                                        autoClosingBrackets: true,
                                        minimap: { scale: 10 },
                                    }}
                                />
                            </div>

                            <div className="translator-component">
                                <h3>Translated Code</h3>
                                <Editor
                                    height="80%"
                                    language={translateToLanguage?.raw}
                                    theme={editorTheme?.value}
                                    value={translatedCode}
                                    onChange={handleTranslatedCodeChanges}
                                    onMount={handleTranslatedEditorDidMount}
                                    options={{
                                        dragAndDrop: false,
                                        inlineSuggest: true,
                                        fontSize: "16px",
                                        formatOnType: true,
                                        autoClosingBrackets: true,
                                        minimap: { scale: 10 },
                                    }}
                                />
                            </div>
                        </div>
                        <ThemeProvider theme={theme}>
                            <Button
                                variant="contained"
                                pill
                                onClick={onCodeTranslateConfirmation}
                            >
                                CONFIRM CHANGES
                            </Button>
                        </ThemeProvider>
                    </Box>
                </Modal>
            )}

            <div className="problem-page-container">
                <div className="problem-tabs-container">
                    <ProblemPageTabs userID={uid} question={question} />
                </div>
                <div className="editor-container" ref={containerRef}>
                    <EditorOptions
                        language={language}
                        editorTheme={editorTheme}
                        handleLanguageChange={handleLanguageChange}
                        handleThemeChange={handleThemeChange}
                    >
                        {type === "coop" && (
                            <>
                                <VideoCall />
                                <ConsoleButton
                                    title={"Leave"}
                                    onClick={handleLeaveRoom}
                                    sx={{
                                        ml: 1,
                                        backgroundColor: "red",
                                        mb: 1,
                                    }}
                                />
                            </>
                        )}
                    </EditorOptions>

                    <div
                        className="editor-component"
                        style={{ height: `${chatHeight}%` }}
                    >
                        <Editor
                            height="100%"
                            language={language?.raw}
                            theme={editorTheme?.value}
                            value={code}
                            onChange={handleCodeChanges}
                            onMount={handleEditorDidMount}
                            options={{
                                dragAndDrop: false,
                                inlineSuggest: true,
                                fontSize: "16px",
                                formatOnType: true,
                                autoClosingBrackets: true,
                                minimap: { scale: 10 },
                            }}
                        />
                    </div>
                    <ResizeBar
                        setHeight={setChatHeight}
                        containerRef={containerRef}
                    />
                    <div
                        className="console-tabs-container"
                        style={{
                            flex: 1,
                            display: hide ? "none" : "flex",
                            height: `${100 - chatHeight}%`,
                        }}
                    >
                        <ConsoleTabs
                            onSubmitChat={onSubmitChat}
                            onSubmitAIChat={onSubmitAIChat}
                            setTextInput={setTextInput}
                            textInput={textInput}
                            aiTextInput={aiTextInput}
                            setAITextInput={setAITextInput}
                            chatDisabled={type !== "coop"}
                            defaultTestCases={defaultTestCases}
                            setTestCase={setTestCase}
                            testCase={testCase}
                            batchSubmission={batchSubmission}
                            isBatch={isBatch}
                        />
                    </div>
                    <div className="console-options">
                        {hide ? (
                            <ConsoleButton
                                onClick={onShow}
                                icon={<KeyboardArrowUpIcon />}
                                title={"Console"}
                            />
                        ) : (
                            <ConsoleButton
                                icon={<KeyboardArrowDownIcon />}
                                onClick={onHide}
                                title={"Console"}
                            />
                        )}

                        <ConsoleButton
                            onClick={onCodeTranslateQuery}
                            title={"AI Code Translation Tool"}
                            sx={{ ml: "auto", mr: 1 }}
                        />

                        <ConsoleButton
                            onClick={onRun}
                            title={"Run"}
                            loading={isRunning ? isRunning : undefined}
                            disabled={isSubmitting}
                            sx={{ ml: "auto", mr: 1 }}
                        />
                        <ConsoleButton
                            onClick={onSubmit}
                            title={"Submit"}
                            loading={isSubmitting ? isSubmitting : undefined}
                            disabled={isRunning}
                            sx={{ backgroundColor: "green" }}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}

export default memo(ProblemPage);
