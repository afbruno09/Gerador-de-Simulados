// =========================
// CONFIGURAÇÃO SUPABASE
// =========================
const SUPABASE_URL = "https://mbwfxkigugrrgfckvyzl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_o44Q1YK3kwmljwXIwVIHPg_LGUYfqKZ";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================
// ESTADO GLOBAL DA APLICAÇÃO
// =========================
let currentUser = null;

let institutions = [];
let questions = [];
let currentQuestions = [];
let timerInterval = null;
let startedAt = null;
let isHeroOpen = true;
let hasCurrentSimulationBeenSaved = false;
let isGeneratingSimulation = false;
let loadingAnimationInstance = null;

// =========================
// TRACKING META PIXEL
// =========================
function trackMeta(eventName, params = {}, method = "trackCustom") {
  if (typeof window === "undefined") return;
  if (typeof window.fbq !== "function") return;

  window.fbq(method, eventName, params);
}

function trackCompleteRegistrationOnce(method = "Google") {
  const key = "meta_complete_registration_tracked";

  if (sessionStorage.getItem(key) === "true") return;

  trackMeta("CompleteRegistration", { method }, "track");
  sessionStorage.setItem(key, "true");
}

function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const paymentStatus = params.get("payment");
  const key = "meta_purchase_tracked";

  if (paymentStatus === "success") {
    if (sessionStorage.getItem(key) === "true") return;

    trackMeta(
      "Purchase",
      {
        content_name: "Premium 60 dias",
        currency: "BRL",
        value: 29.9,
      },
      "track"
    );

    sessionStorage.setItem(key, "true");
  }
}

// =========================
// REFERÊNCIAS DO DOM
// =========================
const institutionGrid = document.getElementById("institutionGrid");
const institutionSelect = document.getElementById("institution");
const generateBtn = document.getElementById("generateBtn");
const correctBtn = document.getElementById("correctBtn");
const bottomCorrectBtn = document.getElementById("bottomCorrectBtn");
const resetBtn = document.getElementById("resetBtn");
const newSimulationBtn = document.getElementById("newSimulationBtn");
const simuladoSection = document.getElementById("simuladoSection");
const institutionsSection = document.getElementById("institutionsSection");
const heroSection = document.getElementById("heroSection");
const collapsedGenerator = document.getElementById("collapsedGenerator");
const toggleHeroBtn = document.getElementById("toggleHeroBtn");
const bottomToggleHeroBtn = document.getElementById("bottomToggleHeroBtn");
const bottomStatusBar = document.getElementById("bottomStatusBar");
const questionsContainer = document.getElementById("questionsContainer");
const resultCard = document.getElementById("resultCard");
const unansweredWarning = document.getElementById("unansweredWarning");
const simuladoTitle = document.getElementById("simuladoTitle");
const simuladoDescription = document.getElementById("simuladoDescription");
const collapsedTitle = document.getElementById("collapsedTitle");
const collapsedDescription = document.getElementById("collapsedDescription");
const timerDisplay = document.getElementById("timerDisplay");
const answeredDisplay = document.getElementById("answeredDisplay");
const progressFill = document.getElementById("progressFill");

const historySection = document.getElementById("history-section");
const toggleHistoryBtn = document.getElementById("toggle-history-btn");
const closeHistoryBtn = document.getElementById("close-history-btn");

const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const mobileUserMenu = document.getElementById("mobile-user-menu");
const mobileHistoryBtn = document.getElementById("mobile-history-btn");
const mobileLogoutBtn = document.getElementById("mobile-logout-btn");
const subscribeButtons = document.querySelectorAll("[data-subscribe-button]");
const confirmSubscriptionButton = document.getElementById("confirm-subscription-button");
const backToPlansButton = document.getElementById("back-to-plans-button");

// =========================
// FUNÇÕES UTILITÁRIAS
// =========================
function initLoadingAnimation() {
  const container = document.getElementById("loadingAnimation");

  if (!container || typeof lottie === "undefined") return;
  if (loadingAnimationInstance) return;

  loadingAnimationInstance = lottie.loadAnimation({
    container,
    renderer: "svg",
    loop: true,
    autoplay: false,
    path: "/assets/book-loading.json",
    rendererSettings: {
      progressiveLoad: true,
      preserveAspectRatio: "xMidYMid meet",
    },
  });
}

function showLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay");

  if (overlay) {
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  initLoadingAnimation();

  if (loadingAnimationInstance) {
    loadingAnimationInstance.goToAndPlay(0, true);
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay");

  if (overlay) {
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  if (loadingAnimationInstance) {
    loadingAnimationInstance.stop();
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function getSelectedAnswer(questionId) {
  const inputs = Array.from(document.querySelectorAll('input[type="radio"]'));
  const selected = inputs.find(
    (input) => input.name === String(questionId) && input.checked
  );
  return selected ? selected.value : null;
}

function getQuestionCard(questionId) {
  const cards = Array.from(document.querySelectorAll(".question-card"));
  return cards.find((card) => card.dataset.questionId === String(questionId)) || null;
}

function getStickyOffset() {
  const header = document.querySelector(".site-header");
  const headerHeight = header ? header.offsetHeight : 0;
  return headerHeight + 16;
}

function scrollToElement(element, extraOffset = 0) {
  if (!element) return;

  const top =
    element.getBoundingClientRect().top +
    window.scrollY -
    getStickyOffset() -
    extraOffset;

  window.scrollTo({
    top: Math.max(top, 0),
    behavior: "smooth",
  });
}

function scrollToSimulationTop() {
  if (resultCard && resultCard.classList.contains("visible")) {
    scrollToElement(resultCard);
    return;
  }

  if (simuladoSection && simuladoSection.style.display !== "none") {
    scrollToElement(simuladoSection);
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// =========================
// CONTROLES DE INTERFACE
// =========================
function closeMobileUserMenu() {
  if (!mobileUserMenu || !mobileMenuBtn) return;

  mobileUserMenu.hidden = true;
  mobileMenuBtn.setAttribute("aria-expanded", "false");
}

function toggleMobileUserMenu() {
  if (!mobileUserMenu || !mobileMenuBtn) return;

  const isOpen = !mobileUserMenu.hidden;
  mobileUserMenu.hidden = isOpen;
  mobileMenuBtn.setAttribute("aria-expanded", isOpen ? "false" : "true");
}

function showSubscriptionConfirmSection(user) {
  const confirmSection = document.getElementById("subscription-confirm-section");
  const loginEmailElement = document.getElementById("subscription-login-email");
  const messageElement = document.getElementById("subscription-message");

  if (!confirmSection || !user) return;

  closeMobileUserMenu();
  confirmSection.hidden = false;

  if (loginEmailElement) {
    loginEmailElement.textContent = user.email || "Conta logada";
  }

  if (messageElement) {
    messageElement.hidden = true;
    messageElement.textContent = "";
  }

  scrollToElement(confirmSection);
}

function hideSubscriptionConfirmSection() {
  const confirmSection = document.getElementById("subscription-confirm-section");
  const messageElement = document.getElementById("subscription-message");

  if (confirmSection) {
    confirmSection.hidden = true;
  }

  if (messageElement) {
    messageElement.hidden = true;
    messageElement.textContent = "";
  }
}

function setHeroCollapsed(collapsed) {
  isHeroOpen = !collapsed;

  if (heroSection) {
    heroSection.classList.toggle("is-minimized", collapsed);
  }

  if (collapsedGenerator) {
    collapsedGenerator.classList.toggle("visible", collapsed);
  }

  if (toggleHeroBtn) {
    toggleHeroBtn.textContent = collapsed ? "Abrir criador" : "Fechar criador";
  }

  if (bottomToggleHeroBtn) {
    bottomToggleHeroBtn.textContent = collapsed ? "Abrir criador" : "Fechar criador";
  }
}

function toggleHero() {
  const shouldCollapse = isHeroOpen;
  setHeroCollapsed(shouldCollapse);

  const target = shouldCollapse ? collapsedGenerator : heroSection;
  scrollToElement(target);
}

// =========================
// AUTENTICAÇÃO E PLANO
// =========================
async function startSubscriptionCheckout(user) {
  const messageElement = document.getElementById("subscription-message");
  const button = document.getElementById("confirm-subscription-button");

  if (!user?.id) {
    if (messageElement) {
      messageElement.hidden = false;
      messageElement.textContent = "Faça login antes de comprar o acesso Premium.";
    }
    return;
  }

  trackMeta(
    "InitiateCheckout",
    {
      content_name: "Premium 60 dias",
      currency: "BRL",
      value: 29.9,
    },
    "track"
  );

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Abrindo pagamento...";
    }

    if (messageElement) {
      messageElement.hidden = true;
      messageElement.textContent = "";
    }

    const response = await fetch("/api/create-access-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        loginEmail: user.email,
      }),
    });

    const rawText = await response.text();
    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      console.error("Resposta não-JSON de /api/create-access-payment:", rawText);
      throw new Error(
        "A API de pagamento não retornou JSON. Verifique a rota /api/create-access-payment na Vercel."
      );
    }

    const checkoutUrl = data.initPoint || data.sandboxInitPoint;

    if (!response.ok || !checkoutUrl) {
      console.error("Erro da API create-access-payment:", data);
      throw new Error(data.error || "Não foi possível iniciar o pagamento.");
    }

    window.location.href = checkoutUrl;
  } catch (error) {
    console.error("Erro ao iniciar pagamento:", error);

    if (messageElement) {
      messageElement.hidden = false;
      messageElement.textContent =
        error.message || "Não foi possível iniciar o pagamento. Tente novamente.";
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Comprar acesso Premium";
    }
  }
}

async function loginWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://gerador-de-simulados-two.vercel.app",
    },
  });

  if (error) {
    console.error("Erro ao fazer login:", error);
    alert("Não foi possível fazer login. Tente novamente.");
  }
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Erro ao sair:", error);
    alert("Não foi possível sair. Tente novamente.");
    return;
  }

  currentUser = null;
  hideSubscriptionConfirmSection();
  await updateAuthUI(null);
}

async function loadUserSession() {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error || !data?.user) {
    currentUser = null;
    await updateAuthUI(null);
    return;
  }

  currentUser = data.user;
  await updateAuthUI(currentUser);
}

async function getUserPlan(userId) {
  if (!userId) return "free";

  const { data, error } = await supabaseClient
    .from("user_access")
    .select("plan, premium_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return "free";
  }

  const isPremium =
    data.plan === "premium" &&
    (!data.premium_until || new Date(data.premium_until).getTime() > Date.now());

  return isPremium ? "premium" : "free";
}

async function updateAuthUI(user) {
  const loggedOutView = document.getElementById("logged-out-view");
  const loggedInView = document.getElementById("logged-in-view");
  const userEmail = document.getElementById("user-email");
  const userPlanBadge = document.getElementById("user-plan-badge");
  const desktopSubscribeButton = document.getElementById("desktop-subscribe-button");
  const mobileSubscribeButton = document.getElementById("mobile-subscribe-button");

  if (!loggedOutView || !loggedInView || !userEmail) return;

  if (user) {
    trackCompleteRegistrationOnce("Google");

    loggedOutView.hidden = true;
    loggedInView.hidden = false;
    userEmail.textContent = user.email || "Usuário logado";

    const userPlan = await getUserPlan(user.id);
    const isPremiumUser = userPlan === "premium";

    if (userPlanBadge) {
      userPlanBadge.textContent = isPremiumUser ? "Premium" : "Plano gratuito";
      userPlanBadge.classList.toggle("is-premium", isPremiumUser);
    }

    if (desktopSubscribeButton) {
      desktopSubscribeButton.hidden = isPremiumUser;
    }

    if (mobileSubscribeButton) {
      mobileSubscribeButton.hidden = isPremiumUser;
    }

    closeMobileUserMenu();
    closeHistorySection();
  } else {
    loggedOutView.hidden = false;
    loggedInView.hidden = true;
    userEmail.textContent = "";

    if (userPlanBadge) {
      userPlanBadge.textContent = "Plano gratuito";
      userPlanBadge.classList.remove("is-premium");
    }

    if (desktopSubscribeButton) {
      desktopSubscribeButton.hidden = false;
    }

    if (mobileSubscribeButton) {
      mobileSubscribeButton.hidden = false;
    }

    hideSubscriptionConfirmSection();
    closeMobileUserMenu();
    closeHistorySection();
    renderUserHistory([]);
  }
}

function setupAuthEvents() {
  const googleLoginBtn = document.getElementById("google-login-btn");
  const logoutBtn = document.getElementById("logout-btn");

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", loginWithGoogle);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthUI(currentUser);
  });
}

// =========================
// HISTÓRICO DE SIMULADOS
// =========================
function openHistorySection() {
  if (!historySection) return;

  if (!currentUser) {
    alert("Entre com sua conta para ver o histórico.");
    return;
  }

  closeMobileUserMenu();
  hideSubscriptionConfirmSection();

  historySection.hidden = false;

  if (toggleHistoryBtn) {
    toggleHistoryBtn.textContent = "Ocultar histórico";
  }

  loadUserHistory();
  scrollToElement(historySection);
}

function closeHistorySection() {
  if (!historySection) return;

  closeMobileUserMenu();
  historySection.hidden = true;

  if (toggleHistoryBtn) {
    toggleHistoryBtn.textContent = "Ver histórico";
  }
}

function toggleHistorySection() {
  if (!historySection) return;

  if (historySection.hidden) {
    openHistorySection();
  } else {
    closeHistorySection();
  }
}

async function loadUserHistory() {
  if (!currentUser) return;

  const historyList = document.getElementById("history-list");
  const historyCount = document.getElementById("history-count");

  if (!historyList || !historyCount) return;

  historyList.innerHTML = `
    <div class="history-empty">
      Carregando últimos simulados...
    </div>
  `;

  const { data, error } = await supabaseClient
    .from("simulations")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Erro ao carregar histórico:", error);

    historyList.innerHTML = `
      <div class="history-empty">
        Não foi possível carregar o histórico.
      </div>
    `;
    return;
  }

  renderUserHistory(data || []);
}

function renderUserHistory(simulations) {
  const historyList = document.getElementById("history-list");
  const historyCount = document.getElementById("history-count");

  if (!historyList || !historyCount) return;

  historyCount.textContent = `${simulations.length} ${
    simulations.length === 1 ? "simulado" : "simulados"
  }`;

  if (!simulations.length) {
    historyList.innerHTML = `
      <div class="history-empty">
        Nenhum simulado corrigido ainda.
      </div>
    `;
    return;
  }

  historyList.innerHTML = simulations
    .map((simulation) => {
      const date = new Date(simulation.created_at).toLocaleDateString("pt-BR");

      return `
      <div class="history-item">
        <div class="history-item-main">
          <strong>${escapeHTML(simulation.institution_name)}</strong>
          <span>
            ${escapeHTML(simulation.topic || "Tema livre")} ·
            ${simulation.total_questions} questões ·
            ${date}
          </span>
        </div>

        <div class="history-actions">
          <div class="history-score">
            ${simulation.score_percent}%
          </div>

          <button
            type="button"
            class="secondary-button view-history-details-btn"
            data-simulation-id="${escapeHTML(simulation.id)}"
          >
            Ver detalhes
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  document.querySelectorAll(".view-history-details-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const simulationId = button.getAttribute("data-simulation-id");
      loadSimulationDetails(simulationId);
    });
  });
}

async function loadSimulationDetails(simulationId) {
  if (!currentUser || !simulationId) return;

  openHistoryDetailsModal();

  const historyDetailsContent = document.getElementById("historyDetailsContent");

  if (historyDetailsContent) {
    historyDetailsContent.innerHTML = `
      <div class="history-empty">
        Carregando detalhes...
      </div>
    `;
  }

  const { data, error } = await supabaseClient
    .from("simulation_questions")
    .select("*")
    .eq("simulation_id", simulationId)
    .order("question_number", { ascending: true });

  if (error) {
    console.error("Erro ao carregar detalhes do simulado:", error);

    if (historyDetailsContent) {
      historyDetailsContent.innerHTML = `
        <div class="history-empty">
          Não foi possível carregar os detalhes deste simulado.
        </div>
      `;
    }

    return;
  }

  renderSimulationDetails(data || []);
}

function renderSimulationDetails(questionsList) {
  const historyDetailsContent = document.getElementById("historyDetailsContent");

  if (!historyDetailsContent) return;

  if (!questionsList.length) {
    historyDetailsContent.innerHTML = `
      <div class="history-empty">
        Nenhuma questão encontrada para este simulado.
      </div>
    `;
    return;
  }

  historyDetailsContent.innerHTML = questionsList
    .map((question) => {
      const options = Array.isArray(question.options) ? question.options : [];
      const userAnswer = question.user_answer || "Não respondida";

      return `
      <article class="history-question-card">
        <h3>Questão ${question.question_number}</h3>
        <p>${escapeHTML(question.statement)}</p>

        <div class="history-options">
          ${options
            .map((option) => {
              const isCorrect = option.id === question.correct_answer;
              const isUserWrong =
                option.id === question.user_answer &&
                question.user_answer !== question.correct_answer;

              return `
              <div class="history-option ${isCorrect ? "correct" : ""} ${
                isUserWrong ? "user-wrong" : ""
              }">
                <strong>${escapeHTML(option.id)}.</strong> ${escapeHTML(option.text)}
              </div>
            `;
            })
            .join("")}
        </div>

        <div class="history-answer-meta">
          <span>Sua resposta: ${escapeHTML(userAnswer)}</span>
          <span>Resposta correta: ${escapeHTML(question.correct_answer)}</span>
        </div>

        <div class="history-comment">
          ${escapeHTML(question.comment || "Comentário não disponível.")}
        </div>
      </article>
    `;
    })
    .join("");
}

function openHistoryDetailsModal() {
  const modal = document.getElementById("historyDetailsModal");
  if (!modal) return;
  modal.hidden = false;
}

function closeHistoryDetailsModal() {
  const modal = document.getElementById("historyDetailsModal");
  if (!modal) return;
  modal.hidden = true;
}

// =========================
// CARGA DE DADOS INICIAIS
// =========================
async function loadData() {
  try {
    const [institutionsResponse, questionsResponse] = await Promise.all([
      fetch("./data/instituicoes.json"),
      fetch("./data/questoes.json"),
    ]);

    if (!institutionsResponse.ok || !questionsResponse.ok) {
      throw new Error("Não foi possível carregar os arquivos JSON.");
    }

    institutions = await institutionsResponse.json();
    questions = await questionsResponse.json();

    renderInstitutionOptions();
    renderInstitutions();
  } catch (error) {
    console.error(error);

    if (institutionGrid) {
      institutionGrid.innerHTML = `
        <div class="empty-state visible">
          Não foi possível carregar os dados do simulado. Verifique se os arquivos data/instituicoes.json e data/questoes.json existem.
        </div>
      `;
    }

    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = "Dados indisponíveis";
    }
  }
}

function renderInstitutionOptions() {
  if (!institutionSelect) return;

  institutionSelect.innerHTML = institutions
    .map(
      (institution) => `
    <option value="${escapeHTML(institution.id)}">${escapeHTML(institution.name)}</option>
  `
    )
    .join("");
}

function renderInstitutions() {
  if (!institutionGrid) return;

  institutionGrid.innerHTML = institutions
    .map(
      (institution) => `
    <div class="institution-card">
      <strong>${escapeHTML(institution.name)}</strong>
      <p>${escapeHTML(institution.styleDescription)}</p>
    </div>
  `
    )
    .join("");
}

function getInstitutionName(id) {
  return institutions.find((institution) => institution.id === id)?.name || "Instituição";
}

// =========================
// TIMER E PROGRESSO
// =========================
function startTimer() {
  stopTimer();
  startedAt = Date.now();

  if (timerDisplay) {
    timerDisplay.textContent = "00:00";
  }

  timerInterval = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);

    if (timerDisplay) {
      timerDisplay.textContent = formatTime(elapsedSeconds);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateAnsweredStatus() {
  const total = currentQuestions.length;

  const answered = currentQuestions.filter((question) => {
    return getSelectedAnswer(question.id);
  }).length;

  const percent = total ? Math.round((answered / total) * 100) : 0;

  if (answeredDisplay) {
    answeredDisplay.textContent = `${answered}/${total}`;
  }

  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
}

// =========================
// GERAÇÃO E RENDERIZAÇÃO DO SIMULADO
// =========================
function questionMatchesTopic(question, topic) {
  if (!topic) return true;

  const normalizedTopic = normalizeText(topic);

  const searchableFields = [
    question.specialty,
    question.topic,
    question.subtopic,
    question.statement,
  ];

  return searchableFields.some((field) =>
    normalizeText(field).includes(normalizedTopic)
  );
}

function normalizeOptions(options) {
  if (Array.isArray(options)) {
    return options
      .filter((option) => option && option.id && option.text)
      .map((option) => ({
        id: String(option.id).trim(),
        text: String(option.text).trim(),
      }));
  }

  if (options && typeof options === "object") {
    const orderedKeys = ["A", "B", "C", "D", "E"];

    return orderedKeys
      .filter((key) => options[key])
      .map((key) => ({
        id: key,
        text: String(options[key]).trim(),
      }));
  }

  return [];
}

function remapOptions(options) {
  const letters = ["A", "B", "C", "D", "E"];

  return options.map((option, index) => ({
    originalId: option.id,
    id: letters[index],
    text: option.text,
  }));
}

function prepareQuestion(question, index, institutionName, topic) {
  const normalizedOptions = normalizeOptions(question.options);
  const shuffledOptions = shuffleArray(normalizedOptions);
  const remappedOptions = remapOptions(shuffledOptions);

  const originalCorrectAnswer = String(question.correctAnswer || "").trim();

  const correctOption = remappedOptions.find((option) => {
    return option.originalId === originalCorrectAnswer;
  });

  return {
    ...question,
    institutionStyle: institutionName || question.institutionStyle || "Instituição",
    topic: topic || question.topic || "Tema livre",
    number: index + 1,
    options: remappedOptions,
    correctAnswer: correctOption ? correctOption.id : originalCorrectAnswer,
  };
}

function getQuestionsForSimulation(quantity, institutionName, topic) {
  const filteredQuestions = questions.filter((question) => {
    return questionMatchesTopic(question, topic);
  });

  const shuffledQuestions = shuffleArray(filteredQuestions);

  const selectedQuestions = shuffledQuestions.slice(
    0,
    Math.min(quantity, shuffledQuestions.length)
  );

  return selectedQuestions.map((question, index) => {
    return prepareQuestion(question, index, institutionName, topic);
  });
}

async function generateQuestionsWithAI({ quantity, institutionName, topic }) {
  const response = await fetch("/api/generate-questions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: currentUser?.id,
      institution: institutionName,
      specialty: topic || "Tema livre",
      questionCount: quantity,
    }),
  });

  const rawText = await response.text();
  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    console.error("Resposta inválida da API de geração:", rawText);
    throw new Error("A API retornou uma resposta inválida.");
  }

  if (!response.ok) {
    const errorMessage =
      data?.error || data?.details || "Não foi possível gerar o simulado com IA.";

    const errorCode = data?.code || "";

    if (errorCode === "FREE_LIMIT_REACHED") {
      throw new Error(`FREE_LIMIT_REACHED::${errorMessage}`);
    }

    throw new Error(errorMessage);
  }

  if (!data || !Array.isArray(data.questions)) {
    throw new Error("A API retornou um formato inválido.");
  }

  return {
    questions: data.questions.map((question, index) =>
      prepareQuestion(question, index, institutionName, topic)
    ),
    meta: data.meta || null,
  };
}

function setGenerateLoading(isLoading) {
  if (!generateBtn) return;

  generateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? "Gerando simulado..." : "Gerar simulado";
  generateBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function showGenerationWarning(message) {
  if (!unansweredWarning) return;

  unansweredWarning.textContent = message;
  unansweredWarning.classList.add("visible");
}

function resetWarning() {
  if (!unansweredWarning) return;

  unansweredWarning.classList.remove("visible");
  unansweredWarning.textContent =
    "Existem questões sem resposta. Elas serão contabilizadas como erro.";
}

async function generateSimulation() {
  if (isGeneratingSimulation) return;

  if (!currentUser) {
    alert("Entre com sua conta para gerar um simulado.");
    return;
  }

  const institutionId = institutionSelect?.value;
  const institutionName = getInstitutionName(institutionId);
  const quantity = Number(document.getElementById("quantity")?.value || 0);
  const topic = document.getElementById("topic")?.value || "Tema livre";

  trackMeta("GenerateSimulationClick", {
    institution_name: institutionName,
    topic: topic,
    questions_count: quantity,
  });

  isGeneratingSimulation = true;
  setGenerateLoading(true);
  showLoadingOverlay();
  resetWarning();
  closeMobileUserMenu();

  if (resultCard) {
    resultCard.classList.remove("visible");
  }

  try {
    const aiResult = await generateQuestionsWithAI({
      quantity,
      institutionName,
      topic,
    });

    currentQuestions = aiResult.questions;

    trackMeta("SimulationGenerated", {
      institution_name: institutionName,
      topic: topic,
      questions_count: aiResult.questions.length,
    });

    if (aiResult.meta?.limitedToFreeMax) {
      showGenerationWarning(
        `No plano gratuito, cada geração está limitada a ${aiResult.meta.deliveredCount} questões.`
      );
    }

    if (!currentQuestions.length) {
      if (simuladoSection) {
        simuladoSection.style.display = "block";
      }

      if (institutionsSection) {
        institutionsSection.style.display = "none";
      }

      if (bottomStatusBar) {
        bottomStatusBar.classList.remove("visible");
      }

      setHeroCollapsed(true);

      if (questionsContainer) {
        questionsContainer.innerHTML = `
          <div class="empty-state visible">
            Nenhuma questão encontrada para esse tema. Tente buscar por uma área mais ampla.
          </div>
        `;
      }

      if (simuladoTitle) {
        simuladoTitle.textContent = "Nenhuma questão encontrada";
      }

      if (simuladoDescription) {
        simuladoDescription.textContent = topic
          ? `Não encontramos questões relacionadas a "${topic}".`
          : "Adicione questões ao arquivo data/questoes.json.";
      }

      if (simuladoSection) {
        scrollToElement(simuladoSection);
      }

      return;
    }

    if (simuladoTitle) {
      simuladoTitle.textContent = `Simulado inspirado em ${institutionName}`;
    }

    if (simuladoDescription) {
      simuladoDescription.textContent = `${currentQuestions.length} questões de múltipla escolha. ${
        topic ? `Tema informado: ${topic}.` : "Tema livre dentro de residência médica."
      }`;
    }

    if (collapsedTitle) {
      collapsedTitle.textContent = `Simulado inspirado em ${institutionName}`;
    }

    if (collapsedDescription) {
      collapsedDescription.textContent = `${currentQuestions.length} questões · ${
        topic || "Tema livre"
      } · Gerado por IA`;
    }

    renderQuestions();

    if (simuladoSection) {
      simuladoSection.style.display = "block";
    }

    if (institutionsSection) {
      institutionsSection.style.display = "none";
    }

    if (bottomStatusBar) {
      bottomStatusBar.classList.add("visible");
    }

    setHeroCollapsed(true);
    startTimer();
    updateAnsweredStatus();

    if (
      currentQuestions.length < quantity &&
      !unansweredWarning?.classList.contains("visible")
    ) {
      showGenerationWarning(
        `Você pediu ${quantity} questões, mas só encontramos ${currentQuestions.length} disponíveis para esse critério.`
      );
    }

    if (simuladoSection) {
      scrollToElement(simuladoSection);
    }
  } catch (error) {
    console.error("Erro ao gerar questões com IA:", error);

    const errorMessage = error?.message || "";

    if (errorMessage.startsWith("FREE_LIMIT_REACHED::")) {
      const cleanMessage = errorMessage.replace("FREE_LIMIT_REACHED::", "");

      if (questionsContainer) {
        questionsContainer.innerHTML = `
          <div class="paywall-layout">
            <article class="paywall-card paywall-limit-card">
              <span class="eyebrow">Limite do plano gratuito</span>
              <h3>Você atingiu o limite diário</h3>
              <p>${escapeHTML(cleanMessage)}</p>
              <p>Seu plano gratuito permite até 2 simulados por dia.</p>
            </article>

            <article class="paywall-card paywall-premium-card">
              <span class="eyebrow">Premium</span>
              <h3>Continue treinando sem bloqueios</h3>

              <p class="paywall-price">
                <strong>R$ 29,90</strong>
                <span>60 dias de acesso</span>
              </p>

              <ul class="paywall-benefits">
                <li>Simulados inéditos gerados por IA</li>
                <li>Mais gerações para continuar estudando</li>
                <li>Correção automática com comentários</li>
                <li>Histórico dos simulados corrigidos</li>
              </ul>

              <button id="inline-upgrade-btn" type="button" class="primary-button">
                Comprar Premium
              </button>
            </article>
          </div>
        `;
      }

      const inlineUpgradeBtn = document.getElementById("inline-upgrade-btn");

      if (inlineUpgradeBtn) {
        inlineUpgradeBtn.addEventListener("click", async () => {
          await startSubscriptionCheckout(currentUser);
        });
      }

      if (simuladoSection) {
        simuladoSection.style.display = "block";
      }

      if (institutionsSection) {
        institutionsSection.style.display = "none";
      }

      if (bottomStatusBar) {
        bottomStatusBar.classList.remove("visible");
      }

      setHeroCollapsed(true);

      if (simuladoSection) {
        scrollToElement(simuladoSection);
      }

      return;
    }

    currentQuestions = getQuestionsForSimulation(quantity, institutionName, topic);

    if (currentQuestions.length) {
      showGenerationWarning(
        "A geração por IA falhou. Carregamos questões da base local para você continuar o treino."
      );

      if (simuladoTitle) {
        simuladoTitle.textContent = `Simulado inspirado em ${institutionName}`;
      }

      if (simuladoDescription) {
        simuladoDescription.textContent = `${currentQuestions.length} questões de múltipla escolha. ${
          topic ? `Tema informado: ${topic}.` : "Tema livre dentro de residência médica."
        }`;
      }

      if (collapsedTitle) {
        collapsedTitle.textContent = `Simulado inspirado em ${institutionName}`;
      }

      if (collapsedDescription) {
        collapsedDescription.textContent = `${currentQuestions.length} questões · ${
          topic || "Tema livre"
        } · Gerado por IA`;
      }

      renderQuestions();

      if (simuladoSection) {
        simuladoSection.style.display = "block";
      }

      if (institutionsSection) {
        institutionsSection.style.display = "none";
      }

      if (bottomStatusBar) {
        bottomStatusBar.classList.add("visible");
      }

      setHeroCollapsed(true);
      startTimer();
      updateAnsweredStatus();

      if (
        currentQuestions.length < quantity &&
        !unansweredWarning?.classList.contains("visible")
      ) {
        showGenerationWarning(
          `Você pediu ${quantity} questões, mas só encontramos ${currentQuestions.length} disponíveis para esse critério.`
        );
      }

      if (simuladoSection) {
        scrollToElement(simuladoSection);
      }

      return;
    }

    if (questionsContainer) {
      questionsContainer.innerHTML = `
        <div class="empty-state visible">
          Não foi possível gerar o simulado agora. Tente novamente em alguns instantes.
        </div>
      `;
    }

    if (simuladoSection) {
      simuladoSection.style.display = "block";
    }

    if (institutionsSection) {
      institutionsSection.style.display = "none";
    }

    if (bottomStatusBar) {
      bottomStatusBar.classList.remove("visible");
    }

    setHeroCollapsed(true);

    if (simuladoSection) {
      scrollToElement(simuladoSection);
    }
  } finally {
    isGeneratingSimulation = false;
    setGenerateLoading(false);
    hideLoadingOverlay();
    hasCurrentSimulationBeenSaved = false;
  }
}

function renderQuestions() {
  if (!questionsContainer) return;

  questionsContainer.innerHTML = currentQuestions
    .map(
      (question) => `
    <article class="question-card" data-question-id="${escapeHTML(question.id)}">
      <div class="question-meta">
        <span class="tag">Questão ${question.number}</span>
        <span class="tag">${escapeHTML(question.examType || "Residência Médica")}</span>
        <span class="tag">${escapeHTML(question.institutionStyle || "Instituição")}</span>
        <span class="tag">${escapeHTML(question.topic || "Tema livre")}</span>
      </div>

      <div class="statement">${escapeHTML(question.statement)}</div>

      <div class="options">
        ${question.options
          .map(
            (option) => `
          <label class="option" data-option-id="${escapeHTML(option.id)}">
            <input type="radio" name="${escapeHTML(question.id)}" value="${escapeHTML(option.id)}" />
            <span><strong>${escapeHTML(option.id)}.</strong> ${escapeHTML(option.text)}</span>
          </label>
        `
          )
          .join("")}
      </div>

      <div class="feedback" id="feedback-${escapeHTML(question.id)}"></div>
    </article>
  `
    )
    .join("");

  document.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener("change", updateAnsweredStatus);
  });
}

// =========================
// CORREÇÃO E SALVAMENTO
// =========================
async function saveSimulationHistory({
  institutionName,
  topic,
  totalQuestions,
  correctAnswers,
  wrongAnswers,
  scorePercent,
}) {
  if (!currentUser || hasCurrentSimulationBeenSaved) return;

  const simulationPayload = {
    user_id: currentUser.id,
    institution_name: institutionName,
    topic: topic || "Tema livre",
    total_questions: totalQuestions,
    correct_answers: correctAnswers,
    wrong_answers: wrongAnswers,
    score_percent: scorePercent,
  };

  const { data: simulationData, error: simulationError } = await supabaseClient
    .from("simulations")
    .insert(simulationPayload)
    .select()
    .single();

  if (simulationError) {
    console.error("Erro ao salvar simulado:", simulationError);
    return;
  }

  const simulationQuestionsPayload = currentQuestions.map((question) => {
    const selectedValue = getSelectedAnswer(question.id);

    return {
      simulation_id: simulationData.id,
      question_number: question.number,
      statement: question.statement,
      options: question.options,
      correct_answer: question.correctAnswer,
      user_answer: selectedValue,
      comment: question.comment,
      topic: question.topic,
      subtopic: question.subtopic,
      specialty: question.specialty,
      difficulty: question.difficulty,
    };
  });

  const { error: questionsError } = await supabaseClient
    .from("simulation_questions")
    .insert(simulationQuestionsPayload);

  if (questionsError) {
    console.error("Erro ao salvar questões do simulado:", questionsError);
    return;
  }

  hasCurrentSimulationBeenSaved = true;
}

async function correctSimulation() {
  if (!currentQuestions.length) return;

  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  currentQuestions.forEach((question) => {
    const selectedValue = getSelectedAnswer(question.id);
    const card = getQuestionCard(question.id);

    if (!card) return;

    const options = card.querySelectorAll(".option");
    const feedback = document.getElementById(`feedback-${question.id}`);

    options.forEach((option) => {
      const optionId = option.getAttribute("data-option-id");

      option.classList.remove("correct", "incorrect");

      if (optionId === question.correctAnswer) {
        option.classList.add("correct");
      }

      if (
        selectedValue &&
        optionId === selectedValue &&
        selectedValue !== question.correctAnswer
      ) {
        option.classList.add("incorrect");
      }
    });

    if (!selectedValue) {
      unanswered += 1;
      wrong += 1;
    } else if (selectedValue === question.correctAnswer) {
      correct += 1;
    } else {
      wrong += 1;
    }

    const status = !selectedValue
      ? "Não respondida"
      : selectedValue === question.correctAnswer
      ? "Correta"
      : "Incorreta";

    const chosenText = selectedValue || "Nenhuma alternativa selecionada";

    if (feedback) {
      feedback.innerHTML = `
        <strong>${escapeHTML(status)}</strong><br />
        Sua resposta: ${escapeHTML(chosenText)}. Resposta correta: ${escapeHTML(
          question.correctAnswer
        )}.<br />
        ${escapeHTML(question.comment)}
      `;

      feedback.classList.add("visible");
    }
  });

  const total = currentQuestions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  trackMeta("SimulationCorrected", {
    institution_name: getInstitutionName(institutionSelect.value),
    topic: document.getElementById("topic")?.value || "Tema livre",
    total_questions: total,
    correct_answers: correct,
    wrong_answers: wrong,
    score_percent: percent,
  });

  const institutionId = institutionSelect.value;
  const institutionName = getInstitutionName(institutionId);
  const topic = document.getElementById("topic").value;

  await saveSimulationHistory({
    institutionName,
    topic,
    totalQuestions: total,
    correctAnswers: correct,
    wrongAnswers: wrong,
    scorePercent: percent,
  });

  if (currentUser && historySection && !historySection.hidden) {
    await loadUserHistory();
  }

  const totalMetric = document.getElementById("totalMetric");
  const correctMetric = document.getElementById("correctMetric");
  const wrongMetric = document.getElementById("wrongMetric");
  const percentMetric = document.getElementById("percentMetric");
  const resultTitle = document.getElementById("resultTitle");

  if (totalMetric) totalMetric.textContent = total;
  if (correctMetric) correctMetric.textContent = correct;
  if (wrongMetric) wrongMetric.textContent = wrong;
  if (percentMetric) percentMetric.textContent = `${percent}%`;
  if (resultTitle) resultTitle.textContent = `Você acertou ${correct} de ${total} questões`;

  if (resultCard) {
    resultCard.classList.add("visible");
  }

  if (unanswered > 0) {
    showGenerationWarning(
      "Existem questões sem resposta. Elas foram contabilizadas como erro."
    );
  } else if (unansweredWarning) {
    unansweredWarning.classList.remove("visible");
  }

  updateAnsweredStatus();
  stopTimer();

  setTimeout(() => {
    scrollToSimulationTop();
  }, 80);
}

function resetAnswers() {
  document.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.checked = false;
  });

  document.querySelectorAll(".option").forEach((option) => {
    option.classList.remove("correct", "incorrect");
  });

  document.querySelectorAll(".feedback").forEach((feedback) => {
    feedback.classList.remove("visible");
    feedback.innerHTML = "";
  });

  if (resultCard) {
    resultCard.classList.remove("visible");
  }

  resetWarning();
  updateAnsweredStatus();
}

function startNewSimulation() {
  resetAnswers();
  stopTimer();
  hideLoadingOverlay();

  currentQuestions = [];
  hasCurrentSimulationBeenSaved = false;
  closeMobileUserMenu();

  if (simuladoSection) {
    simuladoSection.style.display = "none";
  }

  if (institutionsSection) {
    institutionsSection.style.display = "block";
  }

  if (bottomStatusBar) {
    bottomStatusBar.classList.remove("visible");
  }

  setHeroCollapsed(false);

  if (heroSection) {
    scrollToElement(heroSection);
  }
}

// =========================
// EVENT LISTENERS
// =========================
if (generateBtn) {
  generateBtn.addEventListener("click", generateSimulation);
}

if (correctBtn) {
  correctBtn.addEventListener("click", correctSimulation);
}

if (bottomCorrectBtn) {
  bottomCorrectBtn.addEventListener("click", correctSimulation);
}

if (resetBtn) {
  resetBtn.addEventListener("click", resetAnswers);
}

if (newSimulationBtn) {
  newSimulationBtn.addEventListener("click", startNewSimulation);
}

if (toggleHeroBtn) {
  toggleHeroBtn.addEventListener("click", toggleHero);
}

if (bottomToggleHeroBtn) {
  bottomToggleHeroBtn.addEventListener("click", toggleHero);
}

if (toggleHistoryBtn) {
  toggleHistoryBtn.addEventListener("click", toggleHistorySection);
}

if (closeHistoryBtn) {
  closeHistoryBtn.addEventListener("click", closeHistorySection);
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener("click", toggleMobileUserMenu);
}

if (mobileHistoryBtn) {
  mobileHistoryBtn.addEventListener("click", () => {
    closeMobileUserMenu();
    toggleHistorySection();
  });
}

if (mobileLogoutBtn) {
  mobileLogoutBtn.addEventListener("click", async () => {
    closeMobileUserMenu();
    await logout();
  });
}

subscribeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!currentUser) {
      alert("Faça login antes de assinar.");
      return;
    }

    showSubscriptionConfirmSection(currentUser);
  });
});

if (confirmSubscriptionButton) {
  confirmSubscriptionButton.addEventListener("click", async () => {
    await startSubscriptionCheckout(currentUser);
  });
}

if (backToPlansButton) {
  backToPlansButton.addEventListener("click", hideSubscriptionConfirmSection);
}

const closeHistoryDetailsBtn = document.getElementById("closeHistoryDetailsBtn");
const historyDetailsBackdrop = document.getElementById("historyDetailsBackdrop");

if (closeHistoryDetailsBtn) {
  closeHistoryDetailsBtn.addEventListener("click", closeHistoryDetailsModal);
}

if (historyDetailsBackdrop) {
  historyDetailsBackdrop.addEventListener("click", closeHistoryDetailsModal);
}

document.addEventListener("click", (event) => {
  if (!mobileUserMenu || !mobileMenuBtn) return;
  if (window.innerWidth > 640) return;
  if (mobileUserMenu.hidden) return;

  const clickedInsideMenu = mobileUserMenu.contains(event.target);
  const clickedMenuButton = mobileMenuBtn.contains(event.target);

  if (!clickedInsideMenu && !clickedMenuButton) {
    closeMobileUserMenu();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 640) {
    closeMobileUserMenu();
  }
});

// =========================
// INICIALIZAÇÃO DA APLICAÇÃO
// =========================
handlePaymentReturn();
setupAuthEvents();
loadUserSession();
loadData();

window.addEventListener("load", () => {
  initLoadingAnimation();
});
