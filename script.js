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
let hasCurrentSimulationBeenSaved = false;
let isGeneratingSimulation = false;

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

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

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
    loadUserHistory();
  } else {
    loggedOutView.hidden = false;
    loggedInView.hidden = true;
    userEmail.textContent = "";
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

async function loadUserHistory() {
  if (!currentUser) return;

  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');

  if (!historyList || !historyCount) return;

  historyList.innerHTML = `
    <div class="history-empty">
      Carregando últimos simulados...
    </div>
  `;

  const { data, error } = await supabaseClient
    .from('simulations')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Erro ao carregar histórico:', error);

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
  const historyList = document.getElementById('history-list');
  const historyCount = document.getElementById('history-count');

  if (!historyList || !historyCount) return;

  historyCount.textContent = `${simulations.length} ${
    simulations.length === 1 ? 'simulado' : 'simulados'
  }`;

  if (!simulations.length) {
    historyList.innerHTML = `
      <div class="history-empty">
        Nenhum simulado corrigido ainda.
      </div>
    `;
    return;
  }

  historyList.innerHTML = simulations.map(simulation => {
    const date = new Date(simulation.created_at).toLocaleDateString('pt-BR');

    return `
      <div class="history-item">
        <div class="history-item-main">
          <strong>${escapeHTML(simulation.institution_name)}</strong>
          <span>
            ${escapeHTML(simulation.topic || 'Tema livre')} ·
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
            data-simulation-id="${simulation.id}"
          >
            Ver detalhes
          </button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.view-history-details-btn').forEach(button => {
    button.addEventListener('click', () => {
      const simulationId = button.getAttribute('data-simulation-id');
      loadSimulationDetails(simulationId);
    });
  });
}

async function loadSimulationDetails(simulationId) {
  if (!currentUser || !simulationId) return;

  openHistoryDetailsModal();

  const historyDetailsContent = document.getElementById('historyDetailsContent');

  if (historyDetailsContent) {
    historyDetailsContent.innerHTML = `
      <div class="history-empty">
        Carregando detalhes...
      </div>
    `;
  }

  const { data, error } = await supabaseClient
    .from('simulation_questions')
    .select('*')
    .eq('simulation_id', simulationId)
    .order('question_number', { ascending: true });

  if (error) {
    console.error('Erro ao carregar detalhes do simulado:', error);

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

function renderSimulationDetails(questions) {
  const historyDetailsContent = document.getElementById('historyDetailsContent');

  if (!historyDetailsContent) return;

  if (!questions.length) {
    historyDetailsContent.innerHTML = `
      <div class="history-empty">
        Nenhuma questão encontrada para este simulado.
      </div>
    `;
    return;
  }

  historyDetailsContent.innerHTML = questions.map(question => {
    const options = Array.isArray(question.options) ? question.options : [];
    const userAnswer = question.user_answer || 'Não respondida';

    return `
      <article class="history-question-card">
        <h3>Questão ${question.question_number}</h3>

        <p>${escapeHTML(question.statement)}</p>

        <div class="history-options">
          ${options.map(option => {
            const isCorrect = option.id === question.correct_answer;
            const isUserWrong =
              option.id === question.user_answer &&
              question.user_answer !== question.correct_answer;

            return `
              <div class="history-option ${isCorrect ? 'correct' : ''} ${isUserWrong ? 'user-wrong' : ''}">
                <strong>${escapeHTML(option.id)}.</strong> ${escapeHTML(option.text)}
              </div>
            `;
          }).join('')}
        </div>

        <div class="history-answer-meta">
          <span>Sua resposta: ${escapeHTML(userAnswer)}</span>
          <span>Resposta correta: ${escapeHTML(question.correct_answer)}</span>
        </div>

        <div class="history-comment">
          ${escapeHTML(question.comment || 'Comentário não disponível.')}
        </div>
      </article>
    `;
  }).join('');
}

function openHistoryDetailsModal() {
  const modal = document.getElementById('historyDetailsModal');

  if (!modal) return;

  modal.hidden = false;
}

function closeHistoryDetailsModal() {
  const modal = document.getElementById('historyDetailsModal');

  if (!modal) return;

  modal.hidden = true;
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

    if (institutionGrid) {
      institutionGrid.innerHTML = `
        <div class="empty-state visible">
          Não foi possível carregar os dados do simulado. Verifique se os arquivos data/instituicoes.json e data/questoes.json existem.
        </div>
      `;
    }

    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = 'Dados indisponíveis';
    }
  }
}

function renderInstitutionOptions() {
  if (!institutionSelect) return;

  institutionSelect.innerHTML = institutions.map(institution => `
    <option value="${institution.id}">${escapeHTML(institution.name)}</option>
  `).join('');
}

function renderInstitutions() {
  if (!institutionGrid) return;

  institutionGrid.innerHTML = institutions.map(institution => `
    <div class="institution-card">
      <strong>${escapeHTML(institution.name)}</strong>
      <p>${escapeHTML(institution.styleDescription)}</p>
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

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');

  return `${minutes}:${seconds}`;
}

function startTimer() {
  stopTimer();
  startedAt = Date.now();

  if (timerDisplay) {
    timerDisplay.textContent = '00:00';
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

  const answered = currentQuestions.filter(question => {
    return document.querySelector(`input[name="${question.id}"]:checked`);
  }).length;

  const percent = total ? Math.round((answered / total) * 100) : 0;

  if (answeredDisplay) {
    answeredDisplay.textContent = `${answered}/${total}`;
  }

  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
}

function setHeroCollapsed(collapsed) {
  isHeroOpen = !collapsed;

  if (heroSection) {
    heroSection.classList.toggle('is-minimized', collapsed);
  }

  if (collapsedGenerator) {
    collapsedGenerator.classList.toggle('visible', collapsed);
  }

  if (toggleHeroBtn) {
    toggleHeroBtn.textContent = collapsed ? 'Abrir criador' : 'Fechar criador';
  }

  if (bottomToggleHeroBtn) {
    bottomToggleHeroBtn.textContent = collapsed ? 'Abrir criador' : 'Fechar criador';
  }
}

function toggleHero() {
  setHeroCollapsed(isHeroOpen);

  const target = isHeroOpen ? heroSection : collapsedGenerator;

  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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
  const safeOptions = Array.isArray(question.options) ? question.options : [];
  const shuffledOptions = shuffleArray(safeOptions);
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

  if (!data || !Array.isArray(data.questions)) {
    throw new Error('A API retornou um formato inválido.');
  }

  return data.questions.map((question, index) =>
    prepareQuestion(question, index, institutionName, topic)
  );
}

function setGenerateLoading(isLoading) {
  if (!generateBtn) return;

  generateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading
    ? 'Gerando simulado...'
    : 'Gerar simulado';

  generateBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

function showGenerationWarning(message) {
  if (!unansweredWarning) return;

  unansweredWarning.textContent = message;
  unansweredWarning.classList.add('visible');
}

function resetWarning() {
  if (!unansweredWarning) return;

  unansweredWarning.classList.remove('visible');
  unansweredWarning.textContent = 'Existem questões sem resposta. Elas serão contabilizadas como erro.';
}

async function generateSimulation() {
  if (isGeneratingSimulation) return;

  if (!currentUser) {
    alert('Entre com sua conta para gerar um simulado.');
    return;
  }

  const institutionId = institutionSelect.value;
  const institutionName = getInstitutionName(institutionId);
  const quantity = Number(document.getElementById('quantity').value);
  const topic = document.getElementById('topic').value;

  isGeneratingSimulation = true;
  setGenerateLoading(true);
  resetWarning();

  if (resultCard) {
    resultCard.classList.remove('visible');
  }

  try {
    currentQuestions = await generateQuestionsWithAI({
      quantity,
      institutionName,
      topic
    });
  } catch (error) {
    console.error('Erro ao gerar questões com IA:', error);

    currentQuestions = getQuestionsForSimulation(quantity, institutionName, topic);

    if (currentQuestions.length) {
      showGenerationWarning(
        'A geração por IA falhou. Carregamos questões da base local para você continuar o treino.'
      );
    } else {
      if (questionsContainer) {
        questionsContainer.innerHTML = `
          <div class="empty-state visible">
            Não foi possível gerar o simulado agora. Tente novamente em alguns instantes.
          </div>
        `;
      }

      if (simuladoSection) {
        simuladoSection.style.display = 'block';
        simuladoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      return;
    }
  } finally {
    isGeneratingSimulation = false;
    setGenerateLoading(false);
  }

  hasCurrentSimulationBeenSaved = false;

  if (!currentQuestions.length) {
    if (simuladoSection) {
      simuladoSection.style.display = 'block';
    }

    if (institutionsSection) {
      institutionsSection.style.display = 'none';
    }

    if (bottomStatusBar) {
      bottomStatusBar.classList.remove('visible');
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
      simuladoTitle.textContent = 'Nenhuma questão encontrada';
    }

    if (simuladoDescription) {
      simuladoDescription.textContent = topic
        ? `Não encontramos questões relacionadas a "${topic}".`
        : 'Adicione questões ao arquivo data/questoes.json.';
    }

    if (simuladoSection) {
      simuladoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return;
  }

  if (simuladoTitle) {
    simuladoTitle.textContent = `Simulado inspirado em ${institutionName}`;
  }

  if (simuladoDescription) {
    simuladoDescription.textContent = `${currentQuestions.length} questões de múltipla escolha. ${
      topic ? `Tema informado: ${topic}.` : 'Tema livre dentro de residência médica.'
    }`;
  }

  if (collapsedTitle) {
    collapsedTitle.textContent = `Simulado inspirado em ${institutionName}`;
  }

  if (collapsedDescription) {
    collapsedDescription.textContent = `${currentQuestions.length} questões · ${topic || 'Tema livre'} · Gerado por IA`;
  }

  renderQuestions();

  if (simuladoSection) {
    simuladoSection.style.display = 'block';
  }

  if (institutionsSection) {
    institutionsSection.style.display = 'none';
  }

  if (bottomStatusBar) {
    bottomStatusBar.classList.add('visible');
  }

  setHeroCollapsed(true);
  startTimer();
  updateAnsweredStatus();

  if (currentQuestions.length < quantity) {
    showGenerationWarning(
      `Você pediu ${quantity} questões, mas só encontramos ${currentQuestions.length} disponíveis para esse critério.`
    );
  }

  if (simuladoSection) {
    simuladoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderQuestions() {
  if (!questionsContainer) return;

  questionsContainer.innerHTML = currentQuestions.map(question => `
    <article class="question-card" data-question-id="${escapeHTML(question.id)}">
      <div class="question-meta">
        <span class="tag">Questão ${question.number}</span>
        <span class="tag">${escapeHTML(question.examType)}</span>
        <span class="tag">${escapeHTML(question.institutionStyle)}</span>
        <span class="tag">${escapeHTML(question.topic)}</span>
      </div>

      <div class="statement">${escapeHTML(question.statement)}</div>

      <div class="options">
        ${question.options.map(option => `
          <label class="option" data-option-id="${escapeHTML(option.id)}">
            <input type="radio" name="${escapeHTML(question.id)}" value="${escapeHTML(option.id)}" />
            <span><strong>${escapeHTML(option.id)}.</strong> ${escapeHTML(option.text)}</span>
          </label>
        `).join('')}
      </div>

      <div class="feedback" id="feedback-${escapeHTML(question.id)}"></div>
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
  if (!currentUser || hasCurrentSimulationBeenSaved) return;

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
    return;
  }

  hasCurrentSimulationBeenSaved = true;
}

async function correctSimulation() {
  if (!currentQuestions.length) return;

  let correct = 0;
  let wrong = 0;
  let unanswered = 0;

  currentQuestions.forEach(question => {
    const selected = document.querySelector(`input[name="${question.id}"]:checked`);
    const selectedValue = selected ? selected.value : null;
    const card = document.querySelector(`[data-question-id="${question.id}"]`);

    if (!card) return;

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

    if (feedback) {
      feedback.innerHTML = `
        <strong>${escapeHTML(status)}</strong><br />
        Sua resposta: ${escapeHTML(chosenText)}. Resposta correta: ${escapeHTML(question.correctAnswer)}.<br />
        ${escapeHTML(question.comment)}
      `;

      feedback.classList.add('visible');
    }
  });

  const total = currentQuestions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  const institutionId = institutionSelect.value;
  const institutionName = getInstitutionName(institutionId);
  const topic = document.getElementById('topic').value;

  await saveSimulationHistory({
    institutionName,
    topic,
    totalQuestions: total,
    correctAnswers: correct,
    wrongAnswers: wrong,
    scorePercent: percent
  });

  await loadUserHistory();

  const totalMetric = document.getElementById('totalMetric');
  const correctMetric = document.getElementById('correctMetric');
  const wrongMetric = document.getElementById('wrongMetric');
  const percentMetric = document.getElementById('percentMetric');
  const resultTitle = document.getElementById('resultTitle');

  if (totalMetric) totalMetric.textContent = total;
  if (correctMetric) correctMetric.textContent = correct;
  if (wrongMetric) wrongMetric.textContent = wrong;
  if (percentMetric) percentMetric.textContent = `${percent}%`;
  if (resultTitle) resultTitle.textContent = `Você acertou ${correct} de ${total} questões`;

  if (resultCard) {
    resultCard.classList.add('visible');
  }

  if (unanswered > 0) {
    showGenerationWarning('Existem questões sem resposta. Elas foram contabilizadas como erro.');
  } else if (unansweredWarning) {
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

  if (resultCard) {
    resultCard.classList.remove('visible');
  }

  resetWarning();
  updateAnsweredStatus();
}

function startNewSimulation() {
  resetAnswers();
  stopTimer();

  currentQuestions = [];
  hasCurrentSimulationBeenSaved = false;

  if (simuladoSection) {
    simuladoSection.style.display = 'none';
  }

  if (institutionsSection) {
    institutionsSection.style.display = 'block';
  }

  if (bottomStatusBar) {
    bottomStatusBar.classList.remove('visible');
  }

  setHeroCollapsed(false);

  if (heroSection) {
    heroSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

if (generateBtn) {
  generateBtn.addEventListener('click', generateSimulation);
}

if (correctBtn) {
  correctBtn.addEventListener('click', correctSimulation);
}

if (bottomCorrectBtn) {
  bottomCorrectBtn.addEventListener('click', correctSimulation);
}

if (resetBtn) {
  resetBtn.addEventListener('click', resetAnswers);
}

if (newSimulationBtn) {
  newSimulationBtn.addEventListener('click', startNewSimulation);
}

if (toggleHeroBtn) {
  toggleHeroBtn.addEventListener('click', toggleHero);
}

if (bottomToggleHeroBtn) {
  bottomToggleHeroBtn.addEventListener('click', toggleHero);
}

const closeHistoryDetailsBtn = document.getElementById('closeHistoryDetailsBtn');
const historyDetailsBackdrop = document.getElementById('historyDetailsBackdrop');

if (closeHistoryDetailsBtn) {
  closeHistoryDetailsBtn.addEventListener('click', closeHistoryDetailsModal);
}

if (historyDetailsBackdrop) {
  historyDetailsBackdrop.addEventListener('click', closeHistoryDetailsModal);
}

setupAuthEvents();
loadUserSession();
loadData();
