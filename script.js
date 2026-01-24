

// 记得替换成你自己的 Key
// 这样每次脚本运行，都会先去“本地仓库”里找有没有存好的 Key
let DEEPSEEK_API_KEY = localStorage.getItem('ai_user_key') || "";


let currentQuestions = [];
let currentIndex = 0;
let userAnswers = {};

const ANALYSIS_PROMPT = `
# Role
你是一个高精度的文档解析器，严禁任何自我发挥或联网搜索。

# Task
分析用户提供的文档，输出以下内容的统计报告：
1. **板块识别**：是否存在“数媒”与“艺科”两个独立专业部分？
2. **格式镜像**：明确包含几份试卷，完全提取文档中的题型，【禁止复述题目内容】，仅统计题型序列（例如：单选x6, 逻辑规律题x2, 简答x2, 材料分析x1, 图文创作x1）。
3. **考点占比计算**：严格分析文档内容，统计以下领域的占比：数学逻辑、互联网科技、游戏产业、AI/数字媒体、文史哲人文、交互设计。
4. **素材需求**：识别哪些大题需要联网生成新材料，哪些需要用户上传图片。
5. **难度梯度识别**：区分基础题、逻辑推演题、创意论述题的比例。

# Output
请直接使用 Markdown 表格呈现上述 5 项分析结果。表格样式必须简洁清晰。
【死命令】：表格内容必须 100% 来源于文档，确保蓝图比例与原文档 1:1 锚定，以便后续命题使用。`;

const GENERATION_PROMPT = (analysis) => `
# Role
你是一个具备联网能力的 2026 年最新时事命题专家。

# Blueprint Reference
这是基于真题文档生成的蓝图：${analysis}

# Task: 1:1 仿真命题
根据蓝图比例，联网搜索 2025-2026 最新热点（如：Sora, Vision Pro, 具身智能等），输出一份模拟卷。
必须严格遵守蓝图中的【题型序列】。如果蓝图第一部分是单选，你出来的 JSON 第一部分就必须是单选！

# 字段规范（死命令）
每个题目对象必须严格包含以下字段，不得缺失：
- "type": "选择题" 或 "简答题" 或 "创作题"（必须与蓝图匹配）
- "content": "这里是完整的题干内容，严禁空白！"
- "options": ["A. xxx", "B. xxx", "C. xxx", "D. xxx"] (仅选择题必填，否则设为[])
- "answer": "正确选项或核心关键词"
- "analysis": "如果是选择题，提供25字以内的极简解析；如果是简答题、创作题或主观题，提供100字左右的解析，内容必须包含：1.答案范例大纲 2.核心踩分点 3.针对用户可能的回答给出针对性的优化建议。"
- "isGraphic": true (仅当题型为设计题、创作题、绘图题时必须为true，否则为false)
- "hasMaterial": true/false
- "materialContent": "材料内容。如果hasMaterial为true，此处必须提供50-100字之间的背景材料内容，要求专业、严谨且富有艺考科技感；如果不含材料，设为空字符串。"

# JSON 结构
必须输出如下格式：
{
  "examTitle": "2026年数字媒体与艺术科技综合模拟卷",
  "questions": [ 
     { "type": "选择题", "content": "...", "options": [...], "answer": "...", "analysis": "..." },
     ... 
  ]
}

# Requirements
1. **题量对齐**：蓝图说有几题，你就出几题。
2. **真实性**：严禁使用“某公司”，必须使用真实名称。
3. **顺序**：严格按照蓝图的题型顺序排列，严禁第一题出现简答。

只输出 JSON，严禁任何正文说明。`;

// --- 2. 核心处理函数 ---
let docAnalysis = ""; // 全局存储第一步的解析蓝图

// 页面加载时立即执行
window.onload = function() {
    const isRegistered = localStorage.getItem('ai_user_registered');
    if (!isRegistered) {
        document.getElementById('authOverlay').style.display = 'flex';
    } else {
        // 如果已注册，自动将保存的 Key 赋值给全局变量（如果有的话）
        window.DEEPSEEK_API_KEY = localStorage.getItem('ai_user_key');
    }
};

function handleRegister() {
    const user = document.getElementById('regUser').value.trim();
    const key = document.getElementById('regKey').value.trim();

    if (!user || !key) {
        alert("请填写用户名和 API Key 以激活系统");
        return;
    }

    // 保存核心信息
    localStorage.setItem('ai_user_registered', 'true');
    localStorage.setItem('ai_user_name', user);
    localStorage.setItem('ai_user_key', key);

    // 全局赋值
    window.DEEPSEEK_API_KEY = key;

    // 视觉反馈：加个淡出效果
    const overlay = document.getElementById('authOverlay');
    overlay.style.transition = "opacity 0.5s ease";
    overlay.style.opacity = "0";
    
    setTimeout(() => {
        overlay.style.display = 'none';
        alert(`激活成功！祝你金榜题名，${user}`);
    }, 500);
}

function updateFileName() {
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const uploadIcon = document.getElementById('uploadIcon');

    if (fileInput.files.length > 0) {
        const name = fileInput.files[0].name;
        // 更新文字内容
        fileNameDisplay.innerText = `已选：${name}`;
        // 增加高亮样式
        fileNameDisplay.classList.add('has-file');
        // 图标变个颜色或动一下
        uploadIcon.innerText = "✅"; 
        uploadIcon.classList.add('active');
    } else {
        fileNameDisplay.innerText = "点击或拖拽文件到这里";
        fileNameDisplay.classList.remove('has-file');
        uploadIcon.innerText = "📄";
        uploadIcon.classList.remove('active');
    }
}
// 流程 1：深度分析文档（严禁乱编，离线感解析）
async function processFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return alert("请先选择一个文件");

    const loading = document.getElementById('loading');
    const uploadStep = document.getElementById('uploadStep');

    loading.style.display = 'block';
    loading.innerText = "⏳ 正在深度分析文档结构与考点占比...";

    try {
        // 1. 复用你原有的解析逻辑
        let safeText = "";
        if (file.type === "application/pdf") {
            safeText = await getPdfText(file);
        } else {
            safeText = await file.text();
        }

        // 2. 第一阶段请求：纯文本分析
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat", 
                messages: [
                    { role: "system", content: ANALYSIS_PROMPT },
                    { role: "user", content: `请彻底分析此文档的题型结构和考点分布：\n${safeText}` }
                ],
                temperature: 0 // 强制严谨，禁止幻想
            })
        });

        const data = await response.json();
        docAnalysis = data.choices[0].message.content;
        
        // 3. 切换到分析展示界面
        loading.style.display = 'none';
        uploadStep.style.display = 'none';
        document.getElementById('analysisStep').style.display = 'block';
        document.getElementById('analysisContent').innerHTML = docAnalysis.replace(/\n/g, '<br>');

    } catch (error) {
        console.error("分析失败:", error);
        alert("文档分析失败，请检查网络或 API Key");
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

// 流程 2：联网仿真命题（基于蓝图重构）
async function generateExam() {
    // 开头加入：
    const loader = document.getElementById('loadingOverlay');
    loader.style.display = 'flex';
    document.getElementById('loadingMsg').innerText = "🔮 正在联网检索材料，精准命题中...";

    
    const loading = document.getElementById('loading');
    const analysisStep = document.getElementById('analysisStep');
    const quizStep = document.getElementById('quizStep');

    loading.style.display = 'block';
    loading.innerText = "🌐 正在根据蓝图联网命题，请稍后...";
    analysisStep.style.display = 'none';

    let content = ""; 

    try {
        // 校验第一步的分析结果
        if (!docAnalysis || docAnalysis.length < 10) {
            throw new Error("找不到文档分析蓝图，请先完成第一步解析。");
        }

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    // 指令：严禁幻觉，必须看蓝图
                    { role: "system", content: GENERATION_PROMPT(docAnalysis) },
                    { 
                        role: "user", 
                        content: `请仔细阅读 Blueprint 蓝图中的【题型序列】。
                        要求：
                        1. 蓝图中有几道题你就出几道题，不多出也不少出。
                        2. 严格保持题型顺序（如果第一题是选择，你就出选择）。
                        3. 每道题的解析（analysis）控制在20字以内以节省空间。
                        4. 必须输出完整的 JSON。` 
                    }
                ],
                max_tokens: 8192, // 调高上限防止断气
                response_format: { type: "json_object" },
                temperature: 0.3 
            })
        });

        const data = await response.json();
        content = data.choices[0].message.content; 

        // --- 稳健性补丁：自动闭合被截断的 JSON ---
        if (content && !content.trim().endsWith('}')) {
            console.warn("JSON 可能不完整，启动修复...");
            // 如果最后没闭合引号，补引号
            const lastQuoteIdx = content.lastIndexOf('"');
            const lastBraceIdx = content.lastIndexOf('}');
            if (lastQuoteIdx > lastBraceIdx) {
                content += '"';
            }
            // 逐层补齐括号
            if (!content.includes(']')) content += ']}';
            else if (!content.trim().endsWith('}')) content += '}';
        }

        let examData = JSON.parse(content);
        let allQuestions = [];

        // --- 增强版递归抓取 ---
        function deepExtract(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
                // 只要数组里有像题目的东西，就全部收编
                if (obj.length > 0 && (obj[0].content || obj[0].question || obj[0].题目)) {
                    allQuestions = allQuestions.concat(obj);
                    return;
                }
            }
            for (let key in obj) {
                if (typeof obj[key] === 'object') deepExtract(obj[key]);
            }
        }

        deepExtract(examData);

        // 去重
        allQuestions = Array.from(new Set(allQuestions.map(a => JSON.stringify(a)))).map(a => JSON.parse(a));

        if (allQuestions.length === 0) throw new Error("未能从 AI 响应中提取到题目，请重试。");

        // 全局存储
        window.currentQuestions = allQuestions;
        window.currentExam = allQuestions; 
        currentIndex = 0;
        userAnswers = {};

        loading.style.display = 'none';
        quizStep.style.display = 'block';
        
        // 设置标题
        const paperTitle = examData.examTitle || examData.试卷标题 || "2026仿真模拟卷";
        document.getElementById('paperTitle').innerText = paperTitle;

        renderQuestion();
        updateNavigationButtons();
        
    } catch (error) {
        console.error("生成失败:", error);
        alert("命题失败，可能是文档太复杂导致输出截断。建议重试或精简文档。");
        loading.style.display = 'none';
        analysisStep.style.display = 'block';
    }
    // 命题成功/完成后加入：
    loader.style.display = 'none';
}

// --- 3. 答题与渲染逻辑 ---
function renderQuestion() {
    const container = document.getElementById('questionContainer') || document.getElementById('questionArea');
    const q = window.currentQuestions ? window.currentQuestions[currentIndex] : null;
    
    if (!q || !container) return;

    // --- 1. 数据深度提取 (适配 GENERATION_PROMPT 字段) ---
    // 优先取 content，如果为空且有材料，则合并材料内容
    let qContent = q.content || q.question || q.题目 || q.题干 || "";
    if (!qContent && q.materialContent) {
        qContent = q.materialContent;
    }
    
    let qOptions = q.options || q.选项 || [];
    let qType = (q.type || "").toString();

    // --- 2. 强制题型对齐蓝图 (Hard Coding Logic) ---
    // 如果是前 5 题，且 AI 抽风没给选项，尝试从题干提取 A.B.C.D
    if (qOptions.length === 0 && qContent.includes("A.")) {
        const splitPos = qContent.search(/[A-D][.、\s]/);
        if (splitPos !== -1) {
            const optStr = qContent.substring(splitPos);
            qContent = qContent.substring(0, splitPos).trim();
            qOptions = optStr.match(/[A-D][.、\s][^A-D]*/g) || [];
        }
    }

    // 只要有选项，或者题型标记为选择，或者索引在前几位(根据你文档的实际比例调整)
    // 假设蓝图前 5 题是单选：
    const isChoice = qOptions.length > 0 || qType.includes("选择") ;
    // --- 3. 构建 HTML ---
    let html = `<div style="background:#fff; padding:20px; border-radius:12px; border:1px solid #eee; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">`;
    
    // 题头信息
    html += `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #f0f0f0; padding-bottom:10px;">
            <span style="font-weight:bold; color:#8ea8e1;">第 ${currentIndex + 1} 题 | ${isChoice ? '单项选择题' : '主观创作题'}</span>
            ${q.hasMaterial ? '<span style="background:#fff7ed; color:#ea580c; font-size:12px; padding:2px 8px; border-radius:4px; border:1px solid #ffedd5;">含阅读材料</span>' : ''}
        </div>`;

    // 渲染材料内容 (如果 exists)
    if (q.hasMaterial && q.materialContent && q.materialContent !== qContent) {
        html += `<div style="background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:15px; font-size:0.95rem; color:#475569; border-left:4px solid #cbd5e0;">
                    <strong>背景材料：</strong><br>${q.materialContent}
                 </div>`;
    }

    // 渲染主题干
    html += `<div style="font-size:1.15rem; line-height:1.6; font-weight:bold; margin-bottom:20px; color:#1e293b;">${qContent || "题干加载中..."}</div>`;

    // --- 4. 答题区渲染 ---
    if (isChoice) {
        html += `<div style="display:grid; gap:12px;">`;
        if (qOptions.length > 0) {
            qOptions.forEach((opt, i) => {
                const label = opt.match(/^([A-D])/)?.[1] || String.fromCharCode(65 + i);
                const text = opt.replace(/^[A-D][.、\s]*/, "");
                html += `
                    <div onclick="selectOption('${label}')" class="opt-item" 
                         style="padding:15px; border:1.5px solid #e2e8f0; border-radius:10px; cursor:pointer; display:flex; align-items:center; transition:all 0.2s;">
                        <b style="width:28px; height:28px; background:#eff6ff; color:#8ea8e1; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:12px; flex-shrink:0;">${label}</b>
                        <span style="color:#334155;">${text}</span>
                    </div>`;
            });
        } else {
            html += `<p style="color:#ef4444;">未检测到可用的选项数据，请点击下方字母强行补全：</p>`;
            ['A','B','C','D'].forEach(l => {
                html += `<button onclick="selectOption('${l}')" style="margin-right:10px; padding:8px 20px;">${l}</button>`;
            });
        }
        html += `</div>`;
    } else {
        // 1. 获取当前题目已存的数据（这是解决“无法保存”的关键回填逻辑）
        const saved = userAnswers[currentIndex] || {};
        
        // --- 修复点：定义 val 和 img，防止报错 ---
        const val = typeof saved === 'object' ? (saved.text || "") : saved;
        const img = typeof saved === 'object' ? (saved.img || "") : ""; 

        // 2. 渲染 Textarea，必须包含 ${val} 
        html += `<textarea id="subjectiveAns" 
                    placeholder="请输入你的回答..." 
                    oninput="saveCurrentAnswer()" 
                    style="width:100%; height:160px; padding:15px; border:1px solid #cbd5e0; border-radius:8px; font-size:1rem; margin-bottom:10px;">${val}</textarea>`;
        
        // 3. 严格使用 isGraphic 判断
        if (q.isGraphic === true || q.isGraphic === "true") {
            html += `
                <div style="border:2px dashed #c0d8ff; background:rgba(222, 235, 255, 0.5); padding:25px; border-radius:15px; text-align:center; margin-top:15px;">
                    <p style="color:#8ea8e1; font-weight:bold; margin-bottom:15px;">📷 需上传设计草图/示意图</p>
                    
                    <input type="file" id="graphicUpload" accept="image/*" onchange="processImage(event)" style="display:none;">
                    
                    <label for="graphicUpload" class="neumorphic-upload-btn">
                        <span style="font-size: 24px; color: #8ea8e1;">+</span>
                    </label>
                    
                    <div id="imgPreview" style="margin-top:20px;">
                        ${img ? `<img src="${img}" style="max-height:150px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">` : ''}
                    </div>
                </div>`;
        }
        
        html += `</div>`; // 确保 div 闭合
    }
    // 渲染到页面
    container.innerHTML = html;

    // 5. 答案回显
    const saved = userAnswers[currentIndex];
    if (saved) {
        const val = typeof saved === 'object' ? saved.text : saved;
        if (isChoice) setTimeout(() => selectOption(val), 10);
        else if (document.getElementById('subjectiveAns')) document.getElementById('subjectiveAns').value = val;
    }
}
// 辅助回填函数
function restoreAnswerUI(isChoice) {
    const saved = userAnswers[currentIndex];
    if (!saved) return;
    
    if (isChoice) {
        // 提取 label (如果是对象取 text，否则直接取)
        const label = typeof saved === 'object' ? saved.text : saved;
        selectOption(label);
    } else {
        const textEl = document.getElementById('subjectiveAns');
        if (textEl) textEl.value = typeof saved === 'object' ? (saved.text || "") : saved;
    }
}
// 处理选择题点击逻辑
function selectOption(label) {
    // 1. 将答案存入用户答案对象
    userAnswers[currentIndex] = label;

    // 2. 视觉反馈：找到所有的选项元素，把选中的那个变色
    // 注意：这里用的 class 选择器要和你 renderQuestion 里的保持一致
    const allOptions = document.querySelectorAll('.opt-item, .option-item');
    
    allOptions.forEach(opt => {
        // 重置样式（恢复原样）
        opt.style.borderColor = "#ddd"; 
        opt.style.backgroundColor = "white";
        opt.style.boxShadow = "none";

        // 如果这个选项开头是用户点的那一个（比如 "A"）
        // 我们用 textContent 来判断，或者判断它内部的特定结构
        if (opt.innerText.trim().startsWith(label)) {
            opt.style.borderColor = "#8ea8e1";
            opt.style.backgroundColor = "#e7f1ff";
            opt.style.boxShadow = "0 0 5px rgba(0,123,255,0.3)";
        }
    });

    console.log(`第 ${currentIndex + 1} 题记录答案: ${label}`);
}

// 请检查你的 handleImageUpload 或 processImage，确保它是这样存的：
function processImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            let current = userAnswers[currentIndex] || {};
            if (typeof current !== 'object') current = { text: current };
            
            // 存入 img 字段
            current.img = e.target.result;
            userAnswers[currentIndex] = current;
            
            // 刷新预览
            const preview = document.getElementById('imgPreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" style="max-height:120px; border-radius:4px;">`;
            }
        };
        reader.readAsDataURL(file);
    }
}

// 修复 saveCurrentAnswer 以便它能处理图片答案
function saveCurrentAnswer() {
    const q = window.currentQuestions[currentIndex];
    if (!q) return;

    const isChoice = (q.options && q.options.length > 0) || (q.type && q.type.includes("选择"));

    if (!isChoice) {
        const textEl = document.getElementById('subjectiveAns');
        let oldData = userAnswers[currentIndex];
        let newData = {};

        if (oldData) {
            if (typeof oldData === 'object') {
                newData = { ...oldData }; 
            } else {
                newData = { text: oldData }; 
            }
        }

        if (textEl) {
            newData.text = textEl.value; // 实时获取，不加 trim()，防止光标跳动
        }

        // --- 核心修正：只要有字或有图，就保留这个对象 ---
        if ((newData.text && newData.text.length > 0) || newData.img) {
            userAnswers[currentIndex] = newData;
        } else {
            // 如果真的什么都没有，才删除
            delete userAnswers[currentIndex];
        }
    }
}

function changeQuestion(step) {
    // 【核心锁死】：切换前必须保存当前页面的 textarea 值
    saveCurrentAnswer();
    
    const questions = window.currentQuestions || [];
    const newIndex = currentIndex + step;
    
    if (newIndex >= 0 && newIndex < questions.length) {
        currentIndex = newIndex;
        // 渲染新题
        renderQuestion();
        updateNavigationButtons();
        window.scrollTo(0, 0);
    } else if (newIndex >= questions.length && questions.length > 0) {
        // 提交前最后再抓一次当前页面的值（双保险）
        saveCurrentAnswer(); 
        if(confirm("已经是最后一题，是否提交并查看 AI 评分解析？")) {
            showResult();
        }
    } else if (newIndex < 0) {
        alert("已经是第一题了");
    }
}

function updateNavigationButtons() {
    const qs = window.currentQuestions || [];
    const prevBtn = document.getElementById('prevQuestionBtn');
    const nextBtn = document.getElementById('nextQuestionBtn');
    const submitBtn = document.getElementById('submitQuizBtn');

    if (!prevBtn || !nextBtn) return;

    // 第一题隐藏“上一题”
    prevBtn.style.display = (currentIndex === 0) ? 'none' : 'inline-block';
    
    // 最后一题隐藏“下一题”，显示“提交”
    if (currentIndex >= qs.length - 1) {
        nextBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'inline-block';
    } else {
        nextBtn.style.display = 'inline-block';
        if (submitBtn) submitBtn.style.display = 'none';
    }
}


// --- 4. 批改逻辑 ---
async function showResult() {
    saveCurrentAnswer();
    const resultStep = document.getElementById('resultStep');
    const reportCard = document.getElementById('reportCard');
    const quizStep = document.getElementById('quizStep');

    quizStep.style.display = 'none';
    const loader = document.getElementById('loadingOverlay');
    loader.style.display = 'flex';
    document.getElementById('loadingMsg').innerText = "⚖️ AI 阅卷官正在深度分析你的答卷...";

    let score = 0;
    let totalObjective = 0;
    let detailsHTML = "<h3 style='border-bottom:2px solid #333; padding-bottom:10px;'>📊 题目详细复盘</h3>";
    const subjectiveToGrade = [];

    window.currentQuestions.forEach((q, index) => {
        // 1. 拿到原始数据（可能是对象，也可能是空字符串）
        const rawAns = userAnswers[index];
        
        // 2. 【核心修改】：在这里把文字“洗”出来
        // 如果 rawAns 是对象，就取 rawAns.text；否则取 rawAns 本身
        let uAns = "";
        if (rawAns) {
            uAns = (typeof rawAns === 'object' ? (rawAns.text || "") : rawAns).toString().trim();
        }
        // 2. 【新增】提取图片（如果有的话）
        const uImg = (typeof rawAns === 'object' ? (rawAns.img || "") : "");
        
        const qTitle = q.content || q.question || "无题干";
        const qCorrect = (q.answer || q.答案 || "略").toString().trim();
        const qAnalysis = q.analysis || q.解析 || "无";
        const isChoice = (q.options && q.options.length > 0) || (q.type && q.type.includes("选择"));

        if (isChoice) {
            // --- 选择题逻辑完全不动 ---
            totalObjective++;
            const isCorrect = (uAns.charAt(0).toUpperCase() === qCorrect.charAt(0).toUpperCase());
            if (isCorrect) score++;

            detailsHTML += `
                <div style="margin-bottom: 20px; padding: 15px; background: ${isCorrect ? '#9fcbbd' : '#e49fb9'}; border-radius: 10px; border: 1px solid ${isCorrect ? '#f1fffc' : '#fff1fd'};">
                    <p><b>第 ${index + 1} 题 (选择)：</b>${qTitle} ${isCorrect ? '✅' : '❌'}</p>
                    <p>你的答案：<span style="color:${isCorrect ? 'green' : 'red'}">${uAns || '未填'}</span> | 正确答案：<b>${qCorrect}</b></p>
                    <div style="font-size:13px; color:#666; background:#fff; padding:8px; border-radius:5px; margin-top:5px;">解析：${qAnalysis}</div>
                </div>`;
        } else {
            // --- 主观题逻辑：增加图片显示 ---
            subjectiveToGrade.push({ num: index + 1, question: qTitle, userAnswer: uAns, refAnswer: qCorrect });
            
            detailsHTML += `
                <div style="margin-bottom: 20px; padding: 15px; border-radius: 10px; border: 1px solid #eae2f0;">
                    <p><b>第 ${index + 1} 题 (主观)：</b>${qTitle}</p>
                    <div style="color:#8ea8e1; margin:5px 0;">你的回答：${uAns || '未填'}</div>
                    
                    ${uImg ? `<div style="margin-top:10px;"><p style="font-size:12px; color:#666;">上传的图片/草图：</p><img src="${uImg}" style="max-width:200px; border-radius:5px; border:1px solid #ddd;"></div>` : ''}

                    <div style="color:#059669; font-weight:bold; margin-top:10px;">参考考点：${qCorrect}</div>
                    <div style="font-size:13px; color:#666; margin-top:5px;">深度解析：${qAnalysis}</div>
                </div>`;
        }
    });

    // AI 极简点评请求
    let aiCommentary = "正在获取 AI 建议...";
    if (subjectiveToGrade.length > 0) {
        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: [
                        { role: "system", content: "你是一个艺考批改官。请用3句话以内总结考卷表现，直接给主观题分，指出一个最明显的提升点。不许废话，不许客套。" },
                        { role: "user", content: "答卷数据：" + JSON.stringify(subjectiveToGrade) }
                    ]
                })
            });
            const data = await response.json();
            aiCommentary = data.choices[0].message.content;
        } catch (e) { aiCommentary = "AI 评价连接失败，请查看下方题目解析。"; }
    }

    document.getElementById('loading').style.display = 'none';
    resultStep.style.display = 'block';
    
    reportCard.innerHTML = `
        <div style="background:#8ea8e1; color:white; padding:20px; border-radius:10px; margin-bottom:20px; text-align:center;">
            <div style="font-size:0.9rem; opacity:0.9;">客观题正确数</div>
            <div style="font-size:2.5rem; font-weight:bold;">${score} / ${totalObjective}</div>
        </div>
        <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #eae2f0; margin-bottom:20px;">
            <h4 style="margin-top:0;">📝 AI 老师点评：</h4>
            <p style="white-space: pre-wrap; margin:0; line-height:1.5;">${aiCommentary}</p>
        </div>
        ${detailsHTML}
    `;
    loader.style.display = 'none'; // 隐藏动画
    resultStep.style.display = 'block';
}

// --- 修复后的批改逻辑 ---


// --- 修复后的 PDF 导出逻辑 ---
function exportFullExam() {
    if (!window.currentExam) return alert("请先生成模拟卷");

    const element = document.createElement('div');
    // 强制设置导出容器的基准样式
    element.style.cssText = `
        padding: 40px;
        background: #ffffff !important;
        color: #000000 !important;
        font-family: "Microsoft YaHei", sans-serif;
        line-height: 1.5;
    `;

    let fullHtml = `<h1 style="text-align:center; color:#000; font-size:20px; margin-bottom:30px;">${document.getElementById('paperTitle').innerText}</h1>`;
    
    window.currentExam.forEach((q, index) => {
        // 关键点：在这里显式指定黑色，防止继承网页的白色
        const content = q.content || q.question || "";
        const options = q.options || [];
        
        fullHtml += `<div style="margin-bottom: 25px; border-bottom: 1px dashed #eee; padding-bottom: 15px;">
            <p style="color:#000; font-size: 14px; margin-bottom: 8px;"><strong>第 ${index + 1} 题</strong></p>`;

        if (q.hasMaterial && q.materialContent) {
            fullHtml += `<div style="background: #f9f9f9; padding:10px; border:1px solid #ddd; margin:10px 0; color:#333; font-size:12px;">
                <b>阅读材料：</b><br>${q.materialContent}
            </div>`;
        }

        // 题干部分：去掉加粗，缩小字号，强制黑色
        fullHtml += `<p style="color:#000 !important; font-size:14px; font-weight:normal; margin: 10px 0;">${content}</p>`;

        if (options.length > 0) {
            options.forEach(opt => {
                fullHtml += `<p style="margin-left:20px; color:#444 !important; font-size:13px; font-weight:normal;">${opt}</p>`;
            });
        } else {
            fullHtml += `<div style="height:100px; border:1px solid #eee; margin-top:10px;"></div>`;
        }
        fullHtml += `</div>`;
    });

    // 答案页
    fullHtml += `<div style="page-break-before:always;">
        <h2 style="font-size:18px; border-bottom:2px solid #000; color:#000; padding-bottom:5px;">参考答案与解析</h2>`;
    window.currentExam.forEach((q, i) => {
        fullHtml += `<div style="margin-bottom:15px;">
            <p style="font-size:13px; color:#000;"><b>第 ${i+1} 题 [${q.answer || '参考解析'}]</b></p>
            <p style="color:#555; font-size:12px;">解析：${q.analysis || '暂无详细解析'}</p>
        </div>`;
    });
    fullHtml += `</div>`;

    element.innerHTML = fullHtml;

    // 最后的暴力清除：确保没有任何白色残留
    const all = element.querySelectorAll('*');
    all.forEach(node => {
        node.style.setProperty('color', '#000000', 'important');
    });

    html2pdf().set({
        margin: 10,
        filename: '2026模拟卷.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
}

function handleImageUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Img = e.target.result;
            // 存入当前答案对象
            const oldData = userAnswers[currentIndex] || { text: "" };
            userAnswers[currentIndex] = {
                text: typeof oldData === 'object' ? oldData.text : oldData,
                img: base64Img
            };
            // 立即更新预览
            const preview = document.getElementById('imgPreview');
            if (preview) {
                preview.innerHTML = `<img src="${base64Img}" style="max-width:200px; border-radius:5px; border:1px solid #ddd;">`;
            }
        };
        reader.readAsDataURL(input.files[0]);
    }
}


// 驱动背景暗紫色块跟随鼠标
document.addEventListener('mousemove', (e) => {
    // 获取鼠标在屏幕上的百分比位置
    const x = ((e.clientX / window.innerWidth) * 100).toFixed(2);
    const y = ((e.clientY / window.innerHeight) * 100).toFixed(2);
    
    // 动态修改 CSS 变量
    document.documentElement.style.setProperty('--mouse-x', x + '%');
    document.documentElement.style.setProperty('--mouse-y', y + '%');
});