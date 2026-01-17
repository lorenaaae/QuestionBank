

// 记得替换成你自己的 Key
const DEEPSEEK_API_KEY = 'sk-7e07aec52a3e412eb8721d47ff1472d5'; 



let currentQuestions = [];
let currentIndex = 0;
let userAnswers = {};

const SYSTEM_PROMPT = `
你是一位专门从事“数字媒体艺术”与“互联网科技”教育的资深命题专家。
你将接收真题文本，请在后台执行以下思维链分析，但【严禁输出分析过程】，直接以 JSON 格式输出模拟命题。

### 内部思考逻辑（必须严格参照执行）：
1. **物理结构对齐**：精准统计真题的题型种类、数量、分值及考试限时。
2. **考点内核挖掘**：分析真题中“数字媒体、人工智能、互联网科技、电竞、文史哲”的占比及考察偏好。
3. **难度梯度识别**：识别并保留基础知识、逻辑推理与创意论述的梯度比例。
4. **时事融合**：基于上述考察逻辑，将背景全量替换为【2025-2026年最新热点】（如：Sora/生成式视频、MR/空间计算、具身智能、电竞入亚后的数字体育等）。

### 必须输出且仅输出如下 JSON 格式：
{
  "examTitle": "2026年数字媒体艺术专业模拟押题卷 (仿真重构版)",
  "questions": [
    {
      "id": 1,
      "type": "choice", 
      "question": "（结合2026最新热点与真题考点逻辑重构的题目）",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "analysis": "资深专家级的学术解析"
    },
    {
      "id": 2,
      "type": "multiple",
      "question": "（多选题，考查跨学科综合能力）",
      "options": ["A", "B", "C", "D"],
      "answer": "ABC",
      "analysis": "深度解析"
    },
    {
      "id": 3,
      "type": "subjective",
      "question": "（论述大题，难度对标中传三试，具备学术深度）",
      "answer": "核心得分点：1... 2... 3...",
      "analysis": "命题人视角：考查考生对技术哲学的深度理解",
      "modelEssay": "【AI名师范文】：（800-1000字，体现研究生级别的学术深度）"
    }
  ]
}

### 约束限制：
- 严禁输出任何分析报告或开场白，直接输出 JSON 内容。
- 题目深度必须能区分出考生的审美、技术逻辑与行业前瞻性。
- 严禁改变真题原有的物理题型结构。`;

// --- 2. 核心处理函数 ---
async function processFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return alert("请先选择一个文件");

    const loading = document.getElementById('loading');
    const uploadStep = document.getElementById('uploadStep');
    const quizStep = document.getElementById('quizStep');

    loading.style.display = 'block';

    try {
        // 解析 PDF 文字
        let safeText = "";
        if (file.type === "application/pdf") {
            safeText = await getPdfText(file);
        } else {
            safeText = await file.text();
        }
        safeText = safeText.substring(0, 4000);

        // 调用 DeepSeek API
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: `请根据此参考真题卷题型、格式生成模拟卷：\n${safeText}` }
                ],
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        const examData = JSON.parse(data.choices[0].message.content);

        // 初始化答题状态
        currentQuestions = examData.questions;
        window.currentExam = examData.questions; // 供批改使用
        currentIndex = 0;
        userAnswers = {};

        // 切换界面
        loading.style.display = 'none';
        uploadStep.style.display = 'none';
        quizStep.style.display = 'block';
        document.getElementById('paperTitle').innerText = examData.examTitle;

        renderQuestion();

    } catch (error) {
        console.error("解析失败:", error);
        alert("命题失败，请检查 API Key 或文件内容");
        loading.style.display = 'none';
    }
}

// PDF 解析辅助函数
async function getPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ");
    }
    return text;
}

// --- 3. 答题与渲染逻辑 ---
function renderQuestion() {
    const q = currentQuestions[currentIndex];
    const isMultiple = q.type === 'multiple';
    
    let html = `<div class="question-card">
        <h4>第 ${currentIndex + 1} 题 <span class="badge">${isMultiple ? '多选题' : (q.type === 'choice' ? '单选题' : '主观题')}</span></h4>
        <p class="question-text">${q.question}</p>`;

    if (q.type === 'choice' || q.type === 'multiple') {
        const inputType = isMultiple ? 'checkbox' : 'radio';
        q.options.forEach((opt, i) => {
            const char = String.fromCharCode(65 + i);
            // 检查之前是否选过（多选需要检查字符串中是否包含该字母）
            const isChecked = userAnswers[currentIndex] && userAnswers[currentIndex].includes(char) ? 'checked' : '';
            
            html += `<label class="option-item">
                <input type="${inputType}" name="q" value="${char}" ${isChecked}> 
                ${char}. ${opt}
            </label><br>`;
        });
    } else {
        html += `<textarea id="subjectiveAns" rows="6" placeholder="请输入回答...">${userAnswers[currentIndex] || ''}</textarea>`;
    }
    document.getElementById('questionContainer').innerHTML = html;
    
    // 按钮显隐逻辑
    document.getElementById('prevBtn').style.visibility = currentIndex === 0 ? 'hidden' : 'visible';
    document.getElementById('nextBtn').style.display = currentIndex === currentQuestions.length - 1 ? 'none' : 'inline-block';
    document.getElementById('submitBtn').style.display = currentIndex === currentQuestions.length - 1 ? 'inline-block' : 'none';
}

function changeQuestion(step) {
    // 翻页前保存当前答案
    saveCurrentAnswer();
    currentIndex += step;
    renderQuestion();
}

function saveCurrentAnswer() {
    const q = currentQuestions[currentIndex];
    if (q.type === 'choice' || q.type === 'multiple') {
        const checked = Array.from(document.querySelectorAll('input[name="q"]:checked')).map(el => el.value);
        userAnswers[currentIndex] = checked.sort().join(""); // 存为 "ABC" 格式
    } else {
        const text = document.getElementById('subjectiveAns');
        if (text) userAnswers[currentIndex] = text.value;
    }
}

// --- 4. 批改逻辑 ---
async function showResult() {
    saveCurrentAnswer(); // 确保最后一题也存进去了
    
    const resultStep = document.getElementById('resultStep');
    const reportCard = document.getElementById('reportCard');
    const quizStep = document.getElementById('quizStep');

    quizStep.style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').innerText = "正在核对答案并生成 AI 评价...";

    let score = 0;
    let totalObjective = 0;
    let detailsHTML = "<h4>📌 详细得分情况：</h4><ul>";

    // 1. 程序自动判定客观题 (防止 AI 乱判)
    const subjectiveToGrade = []; // 存放大题交给 AI 批改

    currentQuestions.forEach((q, index) => {
        const uAns = userAnswers[index] || "未作答";
        if (q.type === 'choice' || q.type === 'multiple') {
            totalObjective++;
            const isCorrect = (uAns === q.answer);
            if (isCorrect) score++;
            
            // 无论对错都复现题目，但错题用红色高亮
            detailsHTML += `
                <div style="margin-bottom: 20px; padding: 15px; background: ${isCorrect ? '#f0fff4' : '#fff5f5'}; border-radius: 8px; border: 1px solid ${isCorrect ? '#c6f6d5' : '#fed7d7'};">
                    <p><strong>第 ${index + 1} 题：${q.question}</strong> ${isCorrect ? '✅' : '❌'}</p>
                    <p style="font-size: 0.9rem; color: #666;">你的答案: ${uAns} | 正确答案: ${q.answer}</p>
                    <p style="font-size: 0.9rem; margin-top: 5px;"><strong>解析：</strong>${q.analysis}</p>
                </div>`;
        } else {
            subjectiveToGrade.push({
                num: index + 1,
                question: q.question,
                refAnswer: q.answer,
                userAnswer: uAns
            });
        }
    });
    detailsHTML += "</ul><hr>";

    // 2. 主观题请求 AI 评价
    let aiCommentary = "";
    if (subjectiveToGrade.length > 0) {
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        { role: "system", content: "你是一位资深的艺考阅卷老师。请针对用户的主观题回答，对比参考答案，给出具体的【得分点分析】、【改进建议】和【AI 范文】。请直接输出内容，不要废话。" },
                        { role: "user", content: `待批改题目：${JSON.stringify(subjectiveToGrade)}` }
                    ]
                })
            });
            const data = await response.json();
            aiCommentary = data.choices[0].message.content;
        } catch (e) {
            aiCommentary = "主观题批改请求失败，请参考题目解析自行核对。";
        }
    }

    // 3. 渲染最终报告
    document.getElementById('loading').style.display = 'none';
    resultStep.style.display = 'block';
    
    reportCard.innerHTML = `
        <div style="font-size: 1.5rem; margin-bottom: 20px; color: #2563eb;">
            客观题得分：${score} / ${totalObjective}
        </div>
        ${detailsHTML}
        <div style="background: #fff; padding: 15px; border-radius: 8px;">
            <h4>📝 AI 老师点评：</h4>
            <div style="white-space: pre-wrap;">${aiCommentary}</div>
        </div>
    `;
}

function exportFullExam() {
    if (!window.currentExam) return alert("请先生成模拟卷");

    // 1. 创建一个临时的隐藏容器来存放整张卷子的 HTML
    const element = document.createElement('div');
    element.style.padding = '40px';
    element.style.color = '#333';
    
    let fullHtml = `<h1 style="text-align:center;">${document.getElementById('paperTitle').innerText}</h1>`;
    
    window.currentExam.forEach((q, index) => {
        fullHtml += `
            <div style="margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <p><strong>第 ${index + 1} 题 (${q.type === 'choice' ? '选择题' : '主观题'})</strong></p>
                <p style="margin: 10px 0;">${q.question}</p>
        `;
        
        if (q.type === 'choice') {
            q.options.forEach((opt, i) => {
                const char = String.fromCharCode(64 + (i + 1));
                fullHtml += `<p style="margin-left: 20px;">${char}. ${opt}</p>`;
            });
        } else {
            fullHtml += `<div style="height: 150px; border: 1px solid #ccc; margin-top: 10px;"></div><p style="color:#999; font-size: 0.8rem;">(在此答题)</p>`;
        }
        
        fullHtml += `</div>`;
    });

    // 可以在末尾加上答案页（可选）
    fullHtml += `<div style="page-break-before: always;"><h2>参考答案及解析</h2>`;
    window.currentExam.forEach((q, index) => {
        fullHtml += `<p><strong>第 ${index + 1} 题答案:</strong> ${q.answer}</p>
                     <p><strong>解析:</strong> ${q.analysis}</p><br>`;
    });
    fullHtml += `</div>`;

    element.innerHTML = fullHtml;

    // 2. 配置导出参数
    const opt = {
        margin:       10,
        filename:     '中传数媒三试模拟卷.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // 3. 执行导出
    html2pdf().set(opt).from(element).save();
}