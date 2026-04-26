const SUPABASE_URL = "https://mbwfxkigugrrgfckvyzl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_o44Q1YK3kwmljwXIwVIHPg_LGUYfqKZ";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

let institutions = [];
let questions = [];
let currentQuestions = [];
let timerInterval = null;
let startedAt = null;
let isHeroOpen = false;

const institutionGrid = document.getElementById('institutionGrid');
const institutionSelect = document.getElementById('institution');
const generateBtn = document.getElementById('generateBtn');
const correctBtn = document.getElementById('correctBtn');
const bottomCorrectBtn = document.getElementById('bottomCorrectBtn');
const resetBtn = document.getElementById('resetBtn');
const newSimulationBtn = document.getElementById('newSimulationBtn');
const simuladoSection = document.getElementById('simuladoSection');
const institutionsSection = document.getElementById('institutionsSection');
const heroSection = document.getElementById('heroSection');
const collapsedGenerator = document.getElementById('collapsedGenerator');
const toggleHeroBtn = document.getElementById('toggleHeroBtn');
const bottomToggleHeroBtn = document.getElementById('bottomToggleHeroBtn');
const bottomStatusBar = document.getElementById('bottomStatusBar');
const questionsContainer = document.getElementById('questionsContainer');
const resultCard = document.getElementById('resultCard');
const unansweredWarning = document.getElementById('unansweredWarning');
const simuladoTitle = document.getElementById('simuladoTitle');
const simuladoDescription = document.getElementById('simuladoDescription');
const collapsedTitle = document.getElementById('collapsedTitle');
const collapsedDescription = document.getElementById('collapsedDescription');
const timerDisplay = document.getElementById('timerDisplay');
const answeredDisplay = document.getElementById('answeredDisplay');
const progressFill = document.getElementById('progressFill');

async function loginWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://gerador-de-simulados-two.vercel.app"
    }
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
  updateAuthUI(null);
}

async function loadUserSession() {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error || !data?.user) {
    currentUser = null;
    updateAuthUI(null);
    return;
  }

  currentUser = data.user;
  updateAuthUI(currentUser);
}

function updateAuthUI(user) {
  const loggedOutView = document.getElementById("logged-out-view");
  const loggedInView = document.getElementById("logged-in-view");
  const userEmail = document.getElementById("user-email");

  if (!loggedOutView || !loggedInView || !userEmail) return;

  if (user) {
    loggedOutView.hidden = true;
    loggedInView.hidden = false;
    userEmail.textContent = user.email || "Usuário logado";
  } else {
    loggedOutView.hidden = false;
    loggedInView.hidden = true;
    userEmail.textContent = "";
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

async function loadData() {
  try {
    const [institutionsResponse, questionsResponse] = await Promise.all([
      fetch('./data/instituicoes.json'),
      fetch('./data/questoes.json')
    ]);

    if (!institutionsResponse.ok || !questionsResponse.ok) {
      throw new Error('Não foi possível carregar os arquivos JSON.');
    }

    institutions = await institutionsResponse.json();
    questions = await questionsResponse.json();

    renderInstitutionOptions();
    renderInstitutions();
  } catch (error) {
    console.error(error);

    institutionGrid.innerHTML = `
      <div class="empty-state visible">
        Não foi possível carregar os dados do simulado. Verifique se os arquivos data/instituicoes.json e data/questoes.json existem.
      </div>
    `;

    generateBtn.disabled = true;
    generateBtn.textContent = 'Dados indisponíveis';
  }
}

function renderInstitutionOptions() {
  institutionSelect.innerHTML = institutions.map(institution => `
    <option value="${institution.id}">${institution.name}</option>
  `).join('');
}

function renderInstitutions() {
  institutionGrid.innerHTML = institutions.map(institution => `
    <div class="institution-card">
      <strong>${institution.name}</strong>
      <p>${institution.styleDescription}</p>
    </div>
  `).join('');
}

function getInstitutionName(id) {
  return institutions.find(institution => institution.id === id)?.name || 'Instituição';
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  return `${minutes}:${seconds}`;
}

function startTimer() {
  stopTimer();
  startedAt = Date.now();
  timerDisplay.textContent = '00:00';

  timerInterval = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    timerDisplay.textContent = formatTime(elapsedSeconds);
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

  const answered = currentQuestions.filter(question => {
    return document.querySelector(`input[name="${question.id}"]:checked`);
  }).length;

  const percent = total ? Math.round((answered / total) * 100) : 0;

  answeredDisplay.textContent = `${answered}/${total}`;
  progressFill.style.width = `${percent}%`;
}

function setHeroCollapsed(collapsed) {
  isHeroOpen = !collapsed;

  heroSection.classList.toggle('is-minimized', collapsed);
  collapsedGenerator.classList.toggle('visible', collapsed);

  toggleHeroBtn.textContent = collapsed ? 'Abrir criador' : 'Fechar criador';
  bottomToggleHeroBtn.textContent = collapsed ? 'Abrir criador' : 'Fechar criador';
}

function toggleHero() {
  setHeroCollapsed(isHeroOpen);

  const target = isHeroOpen ? heroSection : collapsedGenerator;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function questionMatchesTopic(question, topic) {
  if (!topic) return true;

  const normalizedTopic = normalizeText(topic);

  const searchableFields = [
    question.specialty,
    question.topic,
    question.subtopic,
    question.statement
  ];

  return searchableFields.some(field =>
    normalizeText(field).includes(normalizedTopic)
  );
}

function remapOptions(options) {
  const letters = ['A', 'B', 'C', 'D', 'E'];

  return options.map((option, index) => ({
    originalId: option.id,
    id: letters[index],
    text: option.text
  }));
}

function prepareQuestion(question, index, institutionName, topic) {
  const shuffledOptions = shuffleArray(question.options);
  const remappedOptions = remapOptions(shuffledOptions);

  const correctOption = remappedOptions.find(option => {
    return option.originalId === question.correctAnswer;
  });

  return {
    ...question,
    institutionStyle: institutionName,
    topic: topic || question.topic,
    number: index + 1,
    options: remappedOptions,
    correctAnswer: correctOption ? correctOption.id : question.correctAnswer
  };
}

function getQuestionsForSimulation(quantity, institutionName, topic) {
  const filteredQuestions = questions.filter(question => {
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
  const response = await fetch('/api/generate-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      quantity,
      institutionName,
      topic
    })
  });

  if (!response.ok) {
    throw new Error('Erro ao gerar questões com IA.');
  }

  const data = await response.json();

  return data.questions.map((question, index) =>
    prepareQuestion(question, index, institutionName, topic)
  );
}

function setGenerateLoading(isLoading) {
  generateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? 'Gerando simulado...' : 'Gerar simulado';
}

function showGenerationWarning(message) {
  unansweredWarning.textContent = message;
  unansweredWarning.classList.add('visible');
}

function resetWarning() {
  unansweredWarning.classList.remove('visible');
  unansweredWarning.textContent = 'Existem questões sem resposta. Elas serão contabilizadas como erro.';
}

async function generateSimulation() {
  if (!currentUser) {
    alert('Entre com sua conta para gerar um simulado.');
    return;
  }

  const institutionId = institutionSelect.value;
  const institutionName = getInstitutionName(institutionId);
  const quantity = Number(document.getElementById('quantity').value);
  const topic = document.getElementById('topic').value;

  setGenerateLoading(true);
  resetWarning();
  resultCard.classList.remove('visible');

  try {
    currentQuestions = await generateQuestionsWithAI({
      quantity,
      institutionName,
      topic
    });

    if (!currentQuestions.length) {
      simuladoSection.style.display = 'block';
      institutionsSection.style.display = 'none';
      bottomStatusBar.classList.remove('visible');
      setHeroCollapsed(true);

      questionsContainer.innerHTML = `
        <div class="empty-state visible">
          Nenhuma questão encontrada para esse tema. Tente buscar por uma área mais ampla.
        </div>
      `;

      simuladoTitle.textContent = 'Nenhuma questão encontrada';

      simuladoDescription.textContent = topic
        ? `Não encontramos questões relacionadas a "${topic}".`
        : 'Adicione questões ao arquivo data/questoes.json.';

      simuladoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    simuladoTitle.textContent = `Simulado inspirado em ${institutionName}`;

    simuladoDescription.textContent = `${currentQuestions.length} questões de múltipla escolha. ${
      topic ? `Tema informado: ${topic}.` : 'Tema livre dentro de residência médica.'
    }`;

    collapsedTitle.textContent = `Simulado inspirado em ${institutionName}`;
    collapsedDescription.textContent = `${currentQuestions.length} questões · ${topic || 'Tema livre'} · Gerado por IA`;

    renderQuestions();

    simuladoSection.style.display = 'block';
    institutionsSection.style.display = 'none';
    bottomStatusBar.classList.add('visible');
    setHeroCollapsed(true);
    startTimer();
    updateAnsweredStatus();

    if (currentQuestions.length < quantity) {
      showGenerationWarning(
        `Você pediu ${quantity} questões, mas só encontramos ${currentQuestions.length} disponíveis para esse critério.`
      );
    }

    simuladoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error(error);

    questionsContainer.innerHTML = `
      <div class="empty-state visible">
        Ocorreu um erro ao gerar o simulado. Tente novamente.
      </div>
    `;
  } finally {
    setGenerateLoading(false);
  }
}

function renderQuestions() {
  questionsContainer.innerHTML = currentQuestions.map(question => `
    <article class="question-card" data-question-id="${question.id}">
      <div class="question-meta">
        <span class="tag">Questão ${question.number}</span>
        <span class="tag">${question.examType}</span>
        <span class="tag">${question.institutionStyle}</span>
        <span class="tag">${question.topic}</span>
      </div>

      <div class="statement">${question.statement}</div>

      <div class="options">
        ${question.options.map(option => `
          <label class="option" data-option-id="${option.id}">
            <input type="radio" name="${question.id}" value="${option.id}" />
            <span><strong>${option.id}.</strong> ${option.text}</span>
          </label>
        `).join('')}
      </div>

      <div class="feedback" id="feedback-${question.id}"></div>
    </article>
  `).join('');

  document.querySelectorAll('input[type="radio"]').forEach(input => {
    input.addEventListener('change', updateAnsweredStatus);
  });
}
async function saveSimulationHistory({
  institutionName,
  topic,
  totalQuestions,
  correctAnswers,
  wrongAnswers,
  scorePercent
}) {
  if (!currentUser) return;

  const simulationPayload = {
    user_id: currentUser.id,
    institution_name: institutionName,
    topic: topic || 'Tema livre',
    total_questions: totalQuestions,
    correct_answers: correctAnswers,
    wrong_answers: wrongAnswers,
    score_percent: scorePercent
  };

  const { data: simulationData, error: simulationError } = await supabaseClient
    .from('simulations')
    .insert(simulationPayload)
    .select()
    .single();

  if (simulationError) {
    console.error('Erro ao salvar simulado:', simulationError);
    return;
  }

  const simulationQuestionsPayload = currentQuestions.map(question => {
    const selected = document.querySelector(`input[name="${question.id}"]:checked`);
    const selectedValue = selected ? selected.value : null;

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
      difficulty: question.difficulty
    };
  });

  const { error: questionsError } = await supabaseClient
    .from('simulation_questions')
    .insert(simulationQuestionsPayload);

  if (questionsError) {
    console.error('Erro ao salvar questões do simulado:', questionsError);
  }
}

function correctSimulation() {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  currentQuestions.forEach(question => {
    const selected = document.querySelector(`input[name="${question.id}"]:checked`);
    const selectedValue = selected ? selected.value : null;
    const card = document.querySelector(`[data-question-id="${question.id}"]`);
    const options = card.querySelectorAll('.option');
    const feedback = document.getElementById(`feedback-${question.id}`);

    options.forEach(option => {
      const optionId = option.getAttribute('data-option-id');

      option.classList.remove('correct', 'incorrect');

      if (optionId === question.correctAnswer) {
        option.classList.add('correct');
      }

      if (
        selectedValue &&
        optionId === selectedValue &&
        selectedValue !== question.correctAnswer
      ) {
        option.classList.add('incorrect');
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
      ? 'Não respondida'
      : selectedValue === question.correctAnswer
        ? 'Correta'
        : 'Incorreta';

    const chosenText = selectedValue || 'Nenhuma alternativa selecionada';

    feedback.innerHTML = `
      <strong>${status}</strong><br />
      Sua resposta: ${chosenText}. Resposta correta: ${question.correctAnswer}.<br />
      ${question.comment}
    `;

    feedback.classList.add('visible');
  });

  const total = currentQuestions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  document.getElementById('totalMetric').textContent = total;
  document.getElementById('correctMetric').textContent = correct;
  document.getElementById('wrongMetric').textContent = wrong;
  document.getElementById('percentMetric').textContent = `${percent}%`;
  document.getElementById('resultTitle').textContent = `Você acertou ${correct} de ${total} questões`;

  resultCard.classList.add('visible');

  if (unanswered > 0) {
    showGenerationWarning('Existem questões sem resposta. Elas foram contabilizadas como erro.');
  } else {
    unansweredWarning.classList.remove('visible');
  }

  updateAnsweredStatus();
  stopTimer();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetAnswers() {
  document.querySelectorAll('input[type="radio"]').forEach(input => {
    input.checked = false;
  });

  document.querySelectorAll('.option').forEach(option => {
    option.classList.remove('correct', 'incorrect');
  });

  document.querySelectorAll('.feedback').forEach(feedback => {
    feedback.classList.remove('visible');
    feedback.innerHTML = '';
  });

  resultCard.classList.remove('visible');
  resetWarning();
  updateAnsweredStatus();
}

function startNewSimulation() {
  resetAnswers();
  stopTimer();

  currentQuestions = [];

  simuladoSection.style.display = 'none';
  institutionsSection.style.display = 'block';
  bottomStatusBar.classList.remove('visible');

  setHeroCollapsed(false);

  heroSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

generateBtn.addEventListener('click', generateSimulation);
correctBtn.addEventListener('click', correctSimulation);
bottomCorrectBtn.addEventListener('click', correctSimulation);
resetBtn.addEventListener('click', resetAnswers);
newSimulationBtn.addEventListener('click', startNewSimulation);
toggleHeroBtn.addEventListener('click', toggleHero);
bottomToggleHeroBtn.addEventListener('click', toggleHero);

setupAuthEvents();
loadUserSession();
loadData();
