import { useCallback, useEffect, useMemo, useState } from "react";

const blankTest = {
  title: "My LIKELY",
  introduction: "A few thoughtful questions about how you connect, communicate, and spend your time. Your results are yours to see right away.",
  preferences: "",
  questions: [
    { text: "When a misunderstanding comes up with someone close to you, what usually happens?", category: "Communication", preference: "Calm, direct repair", weight: 9, choices: [{ text: "We talk it through and reset the tone", score: 100 }, { text: "We take a little space, then talk", score: 75 }, { text: "We wait for it to pass on its own", score: 30 }] },
    { text: "What does a great unplanned evening look like to you?", category: "Lifestyle", preference: "Comfort with a little spontaneity", weight: 6, choices: [{ text: "A last-minute outing somewhere new", score: 100 }, { text: "Something simple at home, no big plan", score: 75 }, { text: "I would rather have planned ahead", score: 45 }] },
    { text: "A friend is having a rough day. What are you likely to do?", category: "Values", preference: "Attentive, supportive care", weight: 9, choices: [{ text: "Ask what they need, then show up", score: 100 }, { text: "Listen and let them set the pace", score: 85 }, { text: "Try to solve the problem quickly", score: 55 }] },
    { text: "You discover an interest you both know nothing about. What sounds fun?", category: "Interests", preference: "Curiosity and openness", weight: 7, choices: [{ text: "Explore it together and see where it goes", score: 100 }, { text: "Send each other things about it", score: 80 }, { text: "Keep it as a solo interest", score: 45 }] },
    { text: "At a gathering where you know only one person, what feels natural?", category: "Social habits", preference: "Easygoing social connection", weight: 5, choices: [{ text: "Meet a few new people as the night goes on", score: 100 }, { text: "Stick with my person, then mingle a bit", score: 80 }, { text: "Keep to a quiet corner or leave early", score: 60 }] },
    { text: "What kind of humor tends to make you laugh most?", category: "Humor", preference: "Playful, good-natured humor", weight: 5, choices: [{ text: "Quick observations and silly bits", score: 100 }, { text: "Dry wit and clever wordplay", score: 85 }, { text: "Big stories and playful teasing", score: 70 }] },
    { text: "When making a decision that affects you both, how do you approach it?", category: "Communication", preference: "Collaborative decision-making", weight: 8, choices: [{ text: "Talk it through and decide together", score: 100 }, { text: "Share thoughts, then decide separately", score: 75 }, { text: "Let whoever cares more make the call", score: 45 }] },
    { text: "How do you like to balance together-time and personal time?", category: "Lifestyle", preference: "Closeness with room for independence", weight: 8, choices: [{ text: "Enjoy plans together and keep our own interests", score: 100 }, { text: "Spend most free time together", score: 70 }, { text: "Usually do our own things", score: 55 }] },
    { text: "If plans change at the last minute, what's your usual reaction?", category: "Personality", preference: "Flexible without dismissing others", weight: 6, choices: [{ text: "Adapt and find a different plan", score: 100 }, { text: "Feel disappointed, but work it out", score: 85 }, { text: "I prefer not to change plans", score: 60 }] },
    { text: "What makes you feel most appreciated by someone you're dating?", category: "Relationship expectations", preference: "Thoughtful, consistent connection", weight: 7, choices: [{ text: "Small thoughtful gestures and follow-through", score: 100 }, { text: "Quality time and honest conversation", score: 90 }, { text: "Spontaneous surprises and big moments", score: 70 }] }
  ]
};

const jsonRequest = async (path, { token, ...options } = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
};

function routeFromLocation() {
  const path = window.location.pathname;
  const publicMatch = path.match(/^\/t\/([A-Za-z0-9_-]+)$/);
  const resultMatch = path.match(/^\/results\/([A-Za-z0-9_-]+)$/);
  if (publicMatch) return { page: "respond", id: publicMatch[1] };
  if (resultMatch) return { page: "results", id: resultMatch[1] };
  if (path === "/dashboard") return { page: "dashboard", id: null };
  if (path === "/editor") return { page: "editor", id: null };
  return { page: "home", id: null };
}

function navigateTo(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function Logo({ onClick }) {
  return (
    <button className="brand-lockup" type="button" onClick={onClick} aria-label="LIKELY home">
      <span className="brand-glyph">M<span>·</span></span>
      <span>LIKELY</span>
    </button>
  );
}

function scoreDescription(result) {
  const strengths = result.strongest.map((item) => item.category.toLowerCase());
  if (!strengths.length) return "Your answers are in. This score reflects alignment with the preferences in this questionnaire.";
  return `Your clearest alignments are ${strengths.join(", ")}. This score reflects your answers against the preferences in this questionnaire.`;
}

export default function App() {
  const [route, setRoute] = useState(routeFromLocation);
  const [authToken, setAuthToken] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [authMode, setAuthMode] = useState("signup");
  const [showAuth, setShowAuth] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [editorTest, setEditorTest] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [publicTest, setPublicTest] = useState(null);
  const [publicResult, setPublicResult] = useState(null);
  const [answers, setAnswers] = useState([]);

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  const loadTests = useCallback(async () => {
    const data = await jsonRequest("/api/tests", { token: authToken });
    setTests(data.tests);
  }, [authToken]);

  const loadDashboardTest = useCallback(async (id) => {
    setError("");
    try {
      const data = await jsonRequest(`/api/tests/${id}`, { token: authToken });
      setSelectedTest(data.test);
      setSubmissions(data.submissions);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [authToken]);

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromLocation());
    window.addEventListener("popstate", handlePopState);
    jsonRequest("/api/status").then((status) => setAiConfigured(status.aiConfigured)).catch(() => {});
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!authToken) return;
    loadTests().catch((requestError) => setError(requestError.message));
  }, [authToken, loadTests]);

  useEffect(() => {
    if (route.page === "respond") {
      setBusy(true);
      jsonRequest(`/api/public/tests/${route.id}`)
        .then(({ test }) => {
          setPublicTest(test);
          setAnswers(Array(test.questions.length).fill(null));
          setPublicResult(null);
          setError("");
        })
        .catch((requestError) => setError(requestError.message))
        .finally(() => setBusy(false));
    }
    if (route.page === "results") {
      setBusy(true);
      jsonRequest(`/api/public/results/${route.id}`)
        .then(({ result }) => {
          setPublicResult(result);
          setError("");
        })
        .catch((requestError) => setError(requestError.message))
        .finally(() => setBusy(false));
    }
  }, [route]);

  async function submitAuth(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const data = await jsonRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      setAuthToken(data.token);
      setAccountEmail(data.user.email);
      setAuthPassword("");
      setShowAuth(false);
      navigateTo("/dashboard");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await jsonRequest("/api/auth/logout", { token: authToken, method: "POST" });
    } catch (requestError) {
      showNotice(requestError.message);
    }
    setAuthToken("");
    setAccountEmail("");
    setTests([]);
    setSelectedTest(null);
    navigateTo("/");
  }

  async function startNewTest() {
    setBusy(true);
    setError("");
    try {
      const { test } = await jsonRequest("/api/tests", {
        token: authToken,
        method: "POST",
        body: JSON.stringify(blankTest)
      });
      setEditorTest(test);
      navigateTo("/editor");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTest(event) {
    event?.preventDefault();
    if (!editorTest) return;
    setBusy(true);
    setError("");
    try {
      const { test } = await jsonRequest(`/api/tests/${editorTest.id}`, {
        token: authToken,
        method: "PUT",
        body: JSON.stringify(editorTest)
      });
      setEditorTest(test);
      await loadTests();
      showNotice("Draft saved");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function publishTest() {
    if (!editorTest) return;
    setBusy(true);
    setError("");
    try {
      const { test: savedTest } = await jsonRequest(`/api/tests/${editorTest.id}`, {
        token: authToken,
        method: "PUT",
        body: JSON.stringify(editorTest)
      });
      const { test } = await jsonRequest(`/api/tests/${savedTest.id}/publish`, {
        token: authToken,
        method: "POST"
      });
      setEditorTest(test);
      await loadTests();
      setSelectedTest(test);
      await loadDashboardTest(test.id);
      navigateTo("/dashboard");
      showNotice("Published — your private link is ready");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function generateWithAI() {
    if (!editorTest?.preferences.trim()) {
      setError("Add a preference description first so the AI has something to work with.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await jsonRequest("/api/ai/questions", {
        token: authToken,
        method: "POST",
        body: JSON.stringify({ preferences: editorTest.preferences })
      });
      setEditorTest((current) => ({ ...current, questions: data.questions }));
      showNotice("AI questions generated. Review the scoring before publishing.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTest(test) {
    if (!window.confirm(`Delete “${test.title}” and its submissions? This cannot be undone.`)) return;
    try {
      await jsonRequest(`/api/tests/${test.id}`, { token: authToken, method: "DELETE" });
      setTests((current) => current.filter((item) => item.id !== test.id));
      setSelectedTest(null);
      showNotice("Test and submissions deleted");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteAccount() {
    if (!window.confirm("Delete your account, every test, and all associated anonymous submissions? This cannot be undone.")) return;
    try {
      await jsonRequest("/api/account", { token: authToken, method: "DELETE" });
      setAuthToken("");
      setAccountEmail("");
      setTests([]);
      setSelectedTest(null);
      navigateTo("/");
      showNotice("Account and associated data deleted");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function submitAnswers(event) {
    event.preventDefault();
    if (!publicTest || answers.some((answer) => answer === null)) {
      setError("Please select an answer for each question.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { resultToken, result } = await jsonRequest(
        `/api/public/tests/${publicTest.id}/submissions`,
        { method: "POST", body: JSON.stringify({ answers }) }
      );
      setPublicResult({ ...result, title: publicTest.title });
      navigateTo(`/results/${resultToken}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyShareLink(test) {
    const url = `${window.location.origin}/t/${test.shareId}`;
    try {
      await navigator.clipboard.writeText(url);
      showNotice("Your private link has been copied");
    } catch {
      window.prompt("Copy your share link:", url);
    }
  }

  async function shareTest(test) {
    const url = `${window.location.origin}/t/${test.shareId}`;
    const shareData = { title: test.title, text: "Curious if you're my type? Take my LIKELY.", url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (shareError) {
        if (shareError.name !== "AbortError") showNotice("Sharing is unavailable in this browser.");
      }
    } else {
      await copyShareLink(test);
    }
  }

  const publicUrl = useMemo(() => editorTest?.shareId
    ? `${window.location.origin}/t/${editorTest.shareId}`
    : "", [editorTest]);

  if (route.page === "respond") {
    return (
      <PublicFrame onHome={() => navigateTo("/")}>
        {busy && !publicTest ? <Loading /> : publicTest ? (
          <main className="respondent-page">
            <p className="eyebrow">A LIKELY questionnaire</p>
            <h1>{publicTest.title}</h1>
            <p className="respondent-intro">{publicTest.introduction}</p>
            <div className="privacy-note"><span>◈</span> Answer anonymously. No account or personal details required.</div>
            <form onSubmit={submitAnswers} className="questionnaire">
              {publicTest.questions.map((question, questionIndex) => (
                <fieldset className={`respondent-question ${question.type === "scale" ? "scale-question" : ""}`} key={question.id}>
                  <legend><span>{String(questionIndex + 1).padStart(2, "0")}</span>{question.text}</legend>
                  <div className="respondent-choices">
                    {question.choices.map((choice, choiceIndex) => (
                      <label className={`choice-card ${answers[questionIndex] === choiceIndex ? "chosen" : ""}`} key={choice}>
                        <input
                          type="radio"
                          name={question.id}
                          value={choiceIndex}
                          checked={answers[questionIndex] === choiceIndex}
                          onChange={() => setAnswers((current) => current.map((value, index) =>
                            index === questionIndex ? choiceIndex : value))}
                        />
                        <span className="radio-dot" />
                        <span>{choice}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="button button-primary button-wide" type="submit" disabled={busy}>
                {busy ? "Calculating your results…" : "See my results"} <span aria-hidden="true">→</span>
              </button>
              <p className="fine-note">Your score is guidance—not a verdict or a promise of romantic attraction.</p>
            </form>
          </main>
        ) : <ErrorPanel message={error || "This LIKELY could not be found."} onHome={() => navigateTo("/")} />}
      </PublicFrame>
    );
  }

  if (route.page === "results") {
    return (
      <PublicFrame onHome={() => navigateTo("/")}>
        {busy && !publicResult ? <Loading /> : publicResult ? (
          <ResultsPage result={publicResult} onHome={() => navigateTo("/")} />
        ) : <ErrorPanel message={error || "Your results could not be found."} onHome={() => navigateTo("/")} />}
      </PublicFrame>
    );
  }

  const dashboardPage = route.page === "dashboard" || route.page === "editor";
  if (dashboardPage && !authToken) {
    return (
      <>
        <Landing
          aiConfigured={aiConfigured}
          openAuth={(mode = "signup") => {
            setAuthMode(mode);
            setShowAuth(true);
          }}
          onDashboard={() => {
            setAuthMode("login");
            setShowAuth(true);
          }}
        />
        {showAuth && (
          <AuthModal
            mode={authMode}
            email={authEmail}
            password={authPassword}
            busy={busy}
            error={error}
            setMode={setAuthMode}
            setEmail={setAuthEmail}
            setPassword={setAuthPassword}
            onClose={() => setShowAuth(false)}
            onSubmit={submitAuth}
          />
        )}
      </>
    );
  }

  if (route.page === "editor" && authToken && editorTest) {
    return (
      <CreatorShell
        email={accountEmail}
        onHome={() => navigateTo("/dashboard")}
        onSignOut={signOut}
        notice={notice}
        onAccountDelete={deleteAccount}
      >
        <EditorPage
          test={editorTest}
          setTest={setEditorTest}
          aiConfigured={aiConfigured}
          busy={busy}
          error={error}
          publicUrl={publicUrl}
          onSave={saveTest}
          onPublish={publishTest}
          onGenerate={generateWithAI}
          onCopy={() => copyShareLink(editorTest)}
          onBack={() => navigateTo("/dashboard")}
        />
      </CreatorShell>
    );
  }

  if (route.page === "editor" && authToken && !editorTest) {
    navigateTo("/dashboard");
  }

  if (route.page === "dashboard" && authToken) {
    return (
      <CreatorShell
        email={accountEmail}
        onHome={() => { setSelectedTest(null); navigateTo("/dashboard"); }}
        onSignOut={signOut}
        notice={notice}
        onAccountDelete={deleteAccount}
      >
        <DashboardPage
          tests={tests}
          selectedTest={selectedTest}
          submissions={submissions}
          loading={busy}
          error={error}
          onNewTest={startNewTest}
          onOpenTest={loadDashboardTest}
          onBack={() => setSelectedTest(null)}
          onEdit={(test) => { setEditorTest(test); navigateTo("/editor"); }}
          onDelete={deleteTest}
          onCopyLink={copyShareLink}
          onShare={shareTest}
        />
      </CreatorShell>
    );
  }

  return (
    <>
      <Landing
        aiConfigured={aiConfigured}
        openAuth={(mode = "signup") => {
          setAuthMode(mode);
          setShowAuth(true);
        }}
        onDashboard={() => {
          setAuthMode("login");
          setShowAuth(true);
        }}
      />
      {showAuth && (
        <AuthModal
          mode={authMode}
          email={authEmail}
          password={authPassword}
          busy={busy}
          error={error}
          setMode={setAuthMode}
          setEmail={setAuthEmail}
          setPassword={setAuthPassword}
          onClose={() => { setShowAuth(false); setError(""); }}
          onSubmit={submitAuth}
        />
      )}
    </>
  );
}

function Landing({ openAuth, onDashboard, aiConfigured }) {
  return (
    <div className="landing">
      <header className="site-header">
        <div className="site-header-inner">
          <Logo onClick={() => navigateTo("/")} />
          <nav className="site-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="header-actions">
            <button type="button" className="text-button" onClick={onDashboard}>Log in</button>
            <button type="button" className="button button-small button-primary" onClick={() => openAuth("signup")}>Create your test <span>↗</span></button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-content">
            <div className="pill-label"><span className="sparkle">✳</span> A new way to make the first move</div>
            <h1>Could you be <span>their type?</span></h1>
            <p className="hero-description">A thoughtful questionnaire turns someone's preferences into a clearer picture of how you might align. Take it anonymously. See your results right away.</p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={() => openAuth("signup")}>Create a LIKELY <span>→</span></button>
              <a className="underlined-link" href="#how-it-works">Explore how it works <span>↓</span></a>
            </div>
            <div className="hero-proof"><span className="proof-icon">◈</span><span>Private by design</span><i /><span>No respondent account</span><i /><span>Instant results</span></div>
          </div>

          <div className="hero-art" aria-label="Example anonymous questionnaire and results">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="floating-label label-top"><span className="tiny-spark">✦</span> Your answers stay yours</div>
            <div className="question-card">
              <div className="question-card-head"><span className="mini-logo">M</span><span>LIKELY <small>• 01 / 10</small></span><span className="more-dots">···</span></div>
              <div className="question-card-body">
                <p className="card-overline">A little about you</p>
                <h3>When plans change at the last minute, what feels most like you?</h3>
                <div className="sample-choice selected"><span className="radio-circle" />Adapt and find a new plan <b>✓</b></div>
                <div className="sample-choice"><span className="radio-circle" />Feel a little thrown, then regroup</div>
                <div className="sample-choice"><span className="radio-circle" />I’m happiest when we stick to the plan</div>
                <div className="sample-progress"><span /></div>
              </div>
            </div>
            <div className="floating-result"><div className="result-ring"><span>82<small>%</small></span></div><div><b>Good alignment</b><small>Your results are in.</small></div><span className="result-spark">✳</span></div>
            <div className="floating-label label-bottom"><span>○</span> Completely anonymous</div>
          </div>
        </section>

        <section className="trust-strip">
          <span>MADE FOR MORE MEANINGFUL FIRST MOVES</span><i /><span>Thoughtful questions, not guesswork</span><i /><span>Real answers, always your choice</span>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-intro">
            <p className="eyebrow">A little curiosity goes a long way</p>
            <h2>One link. Two perspectives.<br /><span>A clearer starting point.</span></h2>
            <p>Not a dating app. Not a verdict. Just a more considered way to see how you line up with what someone says they value.</p>
          </div>
          <div className="steps-grid">
            <article className="step-card"><div className="step-number">01 <span>✦</span></div><p className="step-role">FOR THE CREATOR</p><h3>Describe your kind of person.</h3><p>Share what matters to you in your own words. With an AI key, LIKELY turns those preferences into an editable, situational questionnaire.</p></article>
            <article className="step-card featured"><div className="step-number">02 <span>↗</span></div><p className="step-role">FOR THE RESPONDENT</p><h3>Answer as yourself.</h3><p>Take the creator’s questionnaire privately, no account needed. Your answers describe you—not what you think they want to hear.</p></article>
            <article className="step-card"><div className="step-number">03 <span>◉</span></div><p className="step-role">FOR BOTH OF YOU</p><h3>See where you align.</h3><p>Get a clear, immediate alignment score, your strongest shared areas, and places you may see things differently.</p></article>
          </div>
        </section>

        <section className="insight-section" id="privacy">
          <div className="insight-copy"><p className="eyebrow">Clarity without the pressure</p><h2>A score is a starting point. <span>Not a romantic verdict.</span></h2><p>Your results show how your answers match someone’s stated preferences. They can’t predict attraction or tell you what to do next. That part is always yours.</p><button className="button button-quiet" type="button" onClick={() => openAuth("signup")}>Make your own LIKELY <span>→</span></button></div>
          <div className="insight-preview"><div className="preview-top"><span>YOUR RESULTS</span><span className="preview-lock">◈ PRIVATE TO YOU</span></div><div className="preview-score"><strong>82<span>%</span></strong><div><b>Good alignment</b><small>A few promising things in common.</small></div></div><div className="preview-track"><span /></div><div className="preview-tags"><span>Communication</span><span>Shared interests</span><span>Values</span></div><div className="preview-note"><span>✦</span><p>Your strongest matches are communication style and curiosity. You may have a different social rhythm—and that’s just something to learn about each other.</p></div><small className="preview-disclaimer">Your score is guidance, not a guarantee of attraction.</small></div>
        </section>

        <section className="privacy-section">
          <div className="privacy-intro"><p className="eyebrow">Your trust comes first</p><h2>Private, personal,<br /><span>and always your call.</span></h2></div>
          <div className="privacy-points"><article><span>↗</span><div><b>Anonymous by default</b><p>Respondents never have to share their name, email, or social accounts to see their result.</p></div></article><article><span>▣</span><div><b>Your results are yours</b><p>Only you see your score. Creators see anonymous submissions—not who you are.</p></div></article><article><span>⌑</span><div><b>Creator privacy, too</b><p>Questionnaire preferences and private analytics stay behind creator authentication.</p></div></article></div>
        </section>

        <section className="bottom-cta"><div className="cta-star">✳</div><p className="eyebrow">A more thoughtful first step</p><h2>Curiosity looks good<br />on you.</h2><p>Create a LIKELY and see who shares your kind of connection.</p><button className="button button-primary" type="button" onClick={() => openAuth("signup")}>Create your test <span>→</span></button><span className="cta-footnote">Free to start <i /> No respondent signup</span></section>
      </main>

      <footer className="site-footer"><Logo onClick={() => navigateTo("/")} /><p>Alignment is a conversation starter. Nothing more, nothing less.</p><span>© {new Date().getFullYear()} LIKELY</span></footer>
      {!aiConfigured && <div className="config-hint"><span className="config-dot" /> AI generation needs an API key; editable starter questions are ready to use.</div>}
    </div>
  );
}

function AuthModal({ mode, email, password, busy, error, setMode, setEmail, setPassword, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <span className="mini-logo modal-logo">M</span><p className="eyebrow">{mode === "signup" ? "YOUR OWN LIKELY" : "WELCOME BACK"}</p>
        <h2 id="auth-title">{mode === "signup" ? "Start with what matters." : "Good to see you again."}</h2>
        <p className="modal-copy">{mode === "signup" ? "Create your private creator account. Your preferences and responses are encrypted at rest." : "Sign in to your private creator dashboard."}</p>
        <form onSubmit={onSubmit}>
          <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 12 : undefined} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />{mode === "signup" && <small>Use at least 12 characters.</small>}</label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"} <span>→</span></button>
        </form>
        <p className="auth-switch">{mode === "signup" ? "Already have an account?" : "New to LIKELY?"} <button type="button" onClick={() => setMode(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "Log in" : "Create an account"}</button></p>
      </section>
    </div>
  );
}

function CreatorShell({ children, email, onHome, onSignOut, notice, onAccountDelete }) {
  return (
    <div className="creator-layout">
      <aside className="creator-sidebar">
        <Logo onClick={onHome} />
        <div className="sidebar-label">YOUR SPACE</div>
        <button className="sidebar-link active" type="button" onClick={onHome}><span>▦</span> Overview</button>
        <div className="sidebar-bottom"><div className="account-chip"><span className="avatar">{(email || "M")[0].toUpperCase()}</span><span className="account-email">{email}</span></div><button className="sidebar-link" type="button" onClick={onAccountDelete}><span>⌫</span> Delete account</button><button className="sidebar-link" type="button" onClick={onSignOut}><span>↗</span> Sign out</button></div>
      </aside>
      <div className="creator-main"><header className="creator-topbar"><button className="mobile-brand" type="button" onClick={onHome}>LIKELY <span>↗</span></button><span className="private-chip"><i /> Private creator space</span></header><main className="creator-content">{children}</main></div>
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function DashboardPage({ tests, selectedTest, submissions, loading, error, onNewTest, onOpenTest, onBack, onEdit, onDelete, onCopyLink, onShare }) {
  if (selectedTest) {
    const average = submissions.length ? Math.round(submissions.reduce((sum, item) => sum + item.score, 0) / submissions.length) : 0;
    const highest = submissions.length ? Math.max(...submissions.map((item) => item.score)) : 0;
    const categoryMap = new Map();
    submissions.forEach((submission) => submission.questionSnapshot.forEach((question, index) => {
      const choice = question.choices[submission.answers[index]];
      if (!choice) return;
      const stats = categoryMap.get(question.category) || { total: 0, weight: 0 };
      stats.total += choice.score * question.weight;
      stats.weight += question.weight;
      categoryMap.set(question.category, stats);
    }));
    const categories = [...categoryMap.entries()].map(([category, stats]) => ({ category, score: Math.round(stats.total / stats.weight) })).sort((a, b) => b.score - a.score);
    return (
      <>
        <div className="dashboard-heading detail-heading"><div><button type="button" className="back-link" onClick={onBack}>← All LIKELYs</button><p className="eyebrow">PRIVATE ANALYTICS</p><h1>{selectedTest.title}</h1><p>Anonymous submissions and alignment insights</p></div><div className="heading-actions">{selectedTest.published && <><button className="button button-outline" onClick={() => onCopyLink(selectedTest)}>Copy link ↗</button><button className="button button-primary" onClick={() => onShare(selectedTest)}>Share test ↗</button></>}{!selectedTest.published && <button className="button button-outline" onClick={() => onEdit(selectedTest)}>Continue editing</button>}</div></div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="stat-grid"><Stat label="Total submissions" value={submissions.length} suffix="" /><Stat label="Average alignment" value={average} suffix="%" /><Stat label="Highest alignment" value={highest} suffix="%" /><Stat label="Question count" value={selectedTest.questions.length} suffix="" /></div>
        <div className="analytics-grid">
          <section className="surface-card"><div className="surface-heading"><div><p className="eyebrow">CATEGORY INSIGHTS</p><h2>Where people align</h2></div></div>{categories.length ? <div className="category-bars">{categories.map((item) => <div className="category-bar" key={item.category}><span>{item.category}</span><div><i style={{ width: `${item.score}%` }} /></div><b>{item.score}%</b></div>)}</div> : <EmptyInline text="Category insights will appear after your first submission." />}</section>
          <section className="surface-card distribution-card"><div className="surface-heading"><div><p className="eyebrow">SCORE DISTRIBUTION</p><h2>Alignment spread</h2></div></div><div className="distribution-bars">{[[0,49,"0–49"],[50,74,"50–74"],[75,89,"75–89"],[90,100,"90–100"]].map(([min,max,label]) => { const count = submissions.filter((item) => item.score >= min && item.score <= max).length; const height = submissions.length ? Math.max(12, (count / submissions.length) * 100) : 12; return <div key={label} className="distribution-column"><span>{count}</span><i style={{ height: `${height}%` }} /><small>{label}</small></div>; })}</div></section>
        </div>
        <section className="surface-card submissions-card"><div className="surface-heading"><div><p className="eyebrow">ANONYMOUS RESPONSES</p><h2>Recent submissions <span className="count-badge">{submissions.length}</span></h2></div></div>{submissions.length ? <div className="submission-table"><div className="table-head"><span>RESPONDENT</span><span>ALIGNMENT</span><span>STRONGEST AREAS</span><span>SUBMITTED</span></div>{submissions.map((item) => <details className="submission-item" key={item.id}><summary><span className="respondent-id"><span className="avatar small-avatar">◈</span> {item.id}</span><span><b className="table-score">{item.score}%</b> <small>{item.label}</small></span><span className="table-tags">{item.strongest.slice(0,2).map((tag) => <i key={tag.category}>{tag.category}</i>)}</span><span className="submitted-time">{new Date(item.submittedAt).toLocaleString()}</span></summary><div className="submission-detail"><div><b>Potential differences</b><span>{item.differences.map((tag) => `${tag.category} (${tag.score}%)`).join(" · ") || "No distinct category differences"}</span></div><div className="answer-review"><b>Answers</b>{item.questionSnapshot.map((question, index) => <p key={question.id}><span>{question.text}</span><strong>{question.choices[item.answers[index]]?.text}</strong></p>)}</div></div></details>)}</div> : <EmptyInline text="No submissions yet. Share your LIKELY to see anonymous results here." />}</section>
      </>
    );
  }

  const submissionsTotal = tests.reduce((sum, item) => sum + item.submissionCount, 0);
  const average = submissionsTotal ? Math.round(tests.reduce((sum, item) => sum + item.averageScore * item.submissionCount, 0) / submissionsTotal) : 0;
  return (
    <>
      <div className="dashboard-heading"><div><p className="eyebrow">YOUR LIKELYS</p><h1>A little more clarity.</h1><p>Thoughtful questions. Honest answers. Your own next step.</p></div><button className="button button-primary" onClick={onNewTest} disabled={loading}>Create a LIKELY <span>+</span></button></div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="stat-grid"><Stat label="Total submissions" value={submissionsTotal} /><Stat label="Average alignment" value={average} suffix="%" /><Stat label="Published tests" value={tests.filter((item) => item.published).length} /><Stat label="Your tests" value={tests.length} /></div>
      <div className="list-heading"><div><p className="eyebrow">YOUR QUESTIONNAIRES</p><h2>Made by you</h2></div><span className="small-muted">{tests.length} total</span></div>
      {tests.length ? <div className="test-list">{tests.map((item) => <article className="test-row" key={item.id}><button className="test-row-main" onClick={() => onOpenTest(item.id)}><span className="test-icon">✳</span><span className="test-details"><strong>{item.title}</strong><small>{item.published ? `${item.submissionCount} anonymous ${item.submissionCount === 1 ? "response" : "responses"}` : "Draft · only visible to you"}</small></span><span className={`status-pill ${item.published ? "published" : ""}`}>{item.published ? "Published" : "Draft"}</span><span className="test-average">{item.averageScore ? `${item.averageScore}%` : "—"}</span><span className="row-arrow">→</span></button><div className="test-row-actions">{item.published && <button type="button" onClick={() => onCopyLink(item)}>Copy link</button>}<button type="button" onClick={() => onOpenTest(item.id)}>View details</button>{!item.published && <button type="button" onClick={() => onOpenTest(item.id)}>Edit draft</button>}<button className="delete-action" type="button" onClick={() => onDelete(item)}>Delete</button></div></article>)}</div> : <div className="empty-dashboard"><div className="empty-symbol">✳</div><h2>Your first LIKELY starts here.</h2><p>Describe what matters to you, review the questions, and share a link. Respondents see their own result right after they answer.</p><button className="button button-primary" type="button" onClick={onNewTest}>Create your first test <span>→</span></button></div>}
    </>
  );
}

function Stat({ label, value, suffix = "" }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}{suffix}</strong></div>;
}

function EditorPage({ test, setTest, aiConfigured, busy, error, publicUrl, onSave, onPublish, onGenerate, onCopy, onBack }) {
  const updateQuestion = (index, key, value) => setTest((current) => ({ ...current, questions: current.questions.map((question, itemIndex) => itemIndex === index ? { ...question, [key]: value } : question) }));
  const updateChoice = (questionIndex, choiceIndex, key, value) => setTest((current) => ({ ...current, questions: current.questions.map((question, itemIndex) => itemIndex !== questionIndex ? question : { ...question, choices: question.choices.map((choice, itemChoiceIndex) => itemChoiceIndex === choiceIndex ? { ...choice, [key]: value } : choice) }) }));
  const addQuestion = () => setTest((current) => ({ ...current, questions: [...current.questions, { text: "Add a question that reveals how someone thinks or acts.", category: "Other", preference: "Describe the preference this question explores", weight: 5, choices: [{ text: "A response that strongly aligns", score: 100 }, { text: "A response that somewhat aligns", score: 50 }, { text: "A different but valid response", score: 0 }] }] }));
  const changeQuestionType = (index, type) => setTest((current) => ({
    ...current,
    questions: current.questions.map((question, itemIndex) => itemIndex !== index ? question : {
      ...question,
      type,
      choices: type === "scale"
        ? [
            { text: "1 · Not at all", score: 0 },
            { text: "2 · A little", score: 25 },
            { text: "3 · It depends", score: 50 },
            { text: "4 · Mostly", score: 75 },
            { text: "5 · Very much", score: 100 }
          ]
        : [
            { text: "A response that strongly aligns", score: 100 },
            { text: "A response that somewhat aligns", score: 50 },
            { text: "A different but valid response", score: 0 }
          ]
    })
  }));
  const moveQuestion = (index, direction) => setTest((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.questions.length) return current;
    const questions = [...current.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    return { ...current, questions };
  });

  return (
    <form className="editor-page" onSubmit={onSave}>
      <div className="dashboard-heading editor-heading"><div><button type="button" className="back-link" onClick={onBack}>← Back to dashboard</button><p className="eyebrow">QUESTIONNAIRE BUILDER</p><h1>{test.published ? "Your LIKELY is live." : "Shape your LIKELY."}</h1><p>Each answer's score stays paired with its choice as you edit—review the rubric before you publish.</p></div><span className={`status-pill ${test.published ? "published" : ""}`}>{test.published ? "Published · read-only" : "Draft"}</span></div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="editor-layout">
        <div className="editor-main">
          <section className="surface-card editor-section"><div className="editor-section-head"><div><p className="eyebrow">01 / YOUR INTRODUCTION</p><h2>Set the tone</h2></div></div><label className="field-label">Test title<input disabled={test.published} maxLength={80} value={test.title} onChange={(event) => setTest({ ...test, title: event.target.value })} /></label><label className="field-label">What should respondents know?<textarea disabled={test.published} maxLength={500} rows={3} value={test.introduction} onChange={(event) => setTest({ ...test, introduction: event.target.value })} /></label><label className="field-label">What are you looking for? <span className="optional-label">Used for question generation, not shown to respondents</span><textarea disabled={test.published} maxLength={2000} rows={4} placeholder="Describe the qualities, communication style, values, interests, or day-to-day rhythms that matter to you..." value={test.preferences || ""} onChange={(event) => setTest({ ...test, preferences: event.target.value })} /></label><button className="button button-ai" type="button" disabled={test.published || busy} onClick={onGenerate}><span>✦</span>{busy ? "Generating…" : "Generate questions with AI"}</button><p className="field-help">{aiConfigured ? "AI generation uses your server's configured provider. Review all generated questions and scoring before publishing." : "AI is not configured on this server yet. Your editable starter questions are ready; set OPENAI_API_KEY to enable generation."}</p></section>
          <section className="surface-card editor-section questions-section">
            <div className="editor-section-head">
              <div><p className="eyebrow">02 / THE QUESTIONS</p><h2>Make it yours <span className="count-badge">{test.questions.length}</span></h2></div>
              {!test.published && <button type="button" className="button button-outline button-small" onClick={addQuestion} disabled={test.questions.length >= 15}>+ Add question</button>}
            </div>
            <p className="section-hint">Questions describe real moments, not just desirable traits. Add 3–15 questions with multiple-choice or 1–5 scale answers.</p>
            {test.questions.map((question, index) => (
              <QuestionEditor
                key={question.id || index}
                question={question}
                index={index}
                disabled={test.published}
                onQuestionChange={updateQuestion}
                onChoiceChange={updateChoice}
                onTypeChange={changeQuestionType}
                onMove={(direction) => moveQuestion(index, direction)}
                onRemove={() => setTest((current) => ({ ...current, questions: current.questions.filter((_, itemIndex) => itemIndex !== index) }))}
                canRemove={test.questions.length > 3}
                canMoveUp={index > 0}
                canMoveDown={index < test.questions.length - 1}
              />
            ))}
          </section>
        </div>
        <aside className="editor-sidebar"><section className="surface-card publish-card"><p className="eyebrow">03 / PUBLISH</p><h2>Ready to share?</h2><p>Once published, your questions and scoring lock in so existing results always stay consistent.</p>{test.published ? <><div className="published-link"><span>{publicUrl}</span></div><button type="button" className="button button-outline button-wide" onClick={onCopy}>Copy your link ↗</button></> : <><button type="button" className="button button-outline button-wide" disabled={busy} onClick={onSave}>Save draft</button><button type="button" className="button button-primary button-wide" disabled={busy} onClick={onPublish}>Publish LIKELY <span>→</span></button></>}<p className="publish-note">Submissions are anonymous. Respondents receive their score immediately; only you can view the private creator dashboard.</p></section><section className="rubric-card"><span>◈</span><div><b>Scoring stays transparent</b><p>Each response has a 0–100 alignment score, weighted by the importance you set. Your private rubric is never exposed publicly.</p></div></section></aside>
      </div>
    </form>
  );
}

function QuestionEditor({ question, index, disabled, onQuestionChange, onChoiceChange, onTypeChange, onMove, onRemove, canRemove, canMoveUp, canMoveDown }) {
  return (
    <article className="question-edit-card">
      <div className="question-edit-header">
        <span className="question-number">Q{String(index + 1).padStart(2, "0")}</span>
        {!disabled && <div className="question-controls">
          <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move question up">↑</button>
          <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move question down">↓</button>
          <button type="button" className="remove-question" disabled={!canRemove} onClick={onRemove} aria-label="Remove question">×</button>
        </div>}
      </div>
      <label className="field-label">Question<textarea disabled={disabled} rows={2} maxLength={500} value={question.text} onChange={(event) => onQuestionChange(index, "text", event.target.value)} /></label>
      <label className="field-label">Question type<select disabled={disabled} value={question.type || "choice"} onChange={(event) => onTypeChange(index, event.target.value)}><option value="choice">Multiple choice</option><option value="scale">1–5 scale</option></select></label>
      <div className="editor-fields-row">
        <label className="field-label">Category<select disabled={disabled} value={question.category} onChange={(event) => onQuestionChange(index, "category", event.target.value)}>{["Communication","Personality","Interests","Values","Lifestyle","Social habits","Humor","Relationship expectations","Other"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field-label weight-field">Importance <span>{question.weight}/10</span><input disabled={disabled} type="range" min="1" max="10" value={question.weight} onChange={(event) => onQuestionChange(index, "weight", Number(event.target.value))} /></label>
      </div>
      <label className="field-label">Preference this question explores<input disabled={disabled} maxLength={160} value={question.preference} onChange={(event) => onQuestionChange(index, "preference", event.target.value)} /></label>
      <div className="rubric-heading"><span>ANSWER CHOICES</span><span>MATCH SCORE</span></div>
      {question.choices.map((choice, choiceIndex) => (
        <div className="choice-edit-row" key={choiceIndex}>
          <input disabled={disabled} aria-label={`Answer choice ${choiceIndex + 1}`} maxLength={200} value={choice.text} onChange={(event) => onChoiceChange(index, choiceIndex, "text", event.target.value)} />
          <label className="choice-score"><input disabled={disabled} type="number" min="0" max="100" step="1" aria-label={`Choice ${choiceIndex + 1} score`} value={choice.score} onChange={(event) => onChoiceChange(index, choiceIndex, "score", Number(event.target.value))} /><span>%</span></label>
          {!disabled && question.type !== "scale" && question.choices.length > 2 && <button className="remove-choice" type="button" onClick={() => onQuestionChange(index, "choices", question.choices.filter((_, itemIndex) => itemIndex !== choiceIndex))} aria-label="Remove answer choice">×</button>}
        </div>
      ))}
      {!disabled && question.type !== "scale" && question.choices.length < 6 && <button type="button" className="add-choice" onClick={() => onQuestionChange(index, "choices", [...question.choices, { text: "Add another answer choice", score: 50 }])}>+ Add answer choice</button>}
    </article>
  );
}

function PublicFrame({ children, onHome }) {
  return <div className="public-frame"><header className="public-header"><Logo onClick={onHome} /><span><i /> PRIVATE & ANONYMOUS</span></header>{children}<FooterLine /></div>;
}

function ResultsPage({ result, onHome }) {
  return <main className="results-page"><div className="result-confetti">✳</div><p className="eyebrow">YOUR LIKELY RESULTS</p><h1>{result.title}</h1><p className="results-overline">Your alignment score</p><div className="results-gauge" style={{ "--score": `${result.score}%` }}><div><strong>{result.score}<small>%</small></strong><span>{result.label}</span></div></div><p className="results-description">{scoreDescription(result)}</p><div className="results-splits"><section><p className="eyebrow">WHERE YOU ALIGN</p>{result.strongest.length ? result.strongest.map((item) => <div className="result-category" key={item.category}><span>{item.category}</span><strong>{item.score}%</strong></div>) : <p className="fine-note">Your results are ready.</p>}</section><section><p className="eyebrow">ROOM FOR DIFFERENCE</p>{result.differences.length ? result.differences.map((item) => <div className="result-category difference" key={item.category}><span>{item.category}</span><strong>{item.score}%</strong></div>) : <p className="fine-note">Every connection has its own rhythm.</p>}</section></div><div className="results-disclaimer"><span>✦</span><p>{result.disclaimer}</p></div><button className="button button-primary button-wide" type="button" onClick={onHome}>Make your own LIKELY <span>→</span></button><p className="fine-note centered">Your answers are anonymous. Your result link is private to you.</p></main>;
}

function Loading() {
  return <div className="loading-state"><span className="loading-spinner" /> Loading your LIKELY…</div>;
}

function ErrorPanel({ message, onHome }) {
  return <main className="error-panel"><div className="empty-symbol">◌</div><p className="eyebrow">A SMALL DETOUR</p><h1>We couldn't find that page.</h1><p>{message}</p><button className="button button-primary" type="button" onClick={onHome}>Go to LIKELY <span>→</span></button></main>;
}

function EmptyInline({ text }) {
  return <div className="empty-inline"><span>◌</span><p>{text}</p></div>;
}

function FooterLine() {
  return <footer className="public-footer"><Logo onClick={() => navigateTo("/")} /><span>Alignment is a conversation starter. Nothing more, nothing less.</span></footer>;
}
