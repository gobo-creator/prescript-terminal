const defaultCommands = [
  "卒論を30分進めよ。",
  "薬理学の復習を20分行え。",
  "机の上を整理せよ。",
  "10分間ストレッチを行え。",
  "積んでいる本を10ページ読め。",
  "水分を補給し、5分間休息せよ。"
];

const STORAGE_COMMANDS = "prescript_commands_v1";
const STORAGE_HISTORY = "prescript_history_v1";

let commands = loadJson(STORAGE_COMMANDS, defaultCommands);
let history = loadJson(STORAGE_HISTORY, []);
let currentHistoryId = null;

const views = { idle: document.getElementById("idleView"), decoding: document.getElementById("decodingView") };
const receiveButton = document.getElementById("receiveButton");
const retryButton = document.getElementById("retryButton");
const completeButton = document.getElementById("completeButton");
const settingsButton = document.getElementById("settingsButton");
const soundButton = document.getElementById("soundButton");
const commandDialog = document.getElementById("commandDialog");
const addCommandButton = document.getElementById("addCommandButton");
const commandInput = document.getElementById("commandInput");
const resetCommandsButton = document.getElementById("resetCommandsButton");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const progressBar = document.getElementById("progressBar");
const decodingText = document.getElementById("decodingText");
const candidateText = document.getElementById("candidateText");
const decodingPhase = document.getElementById("decodingPhase");
const decodingTerminal = document.querySelector(".decoding-terminal");
const screenTitle = document.getElementById("screenTitle");
const screenFoot = document.getElementById("screenFoot");
const terminalModeLabel = document.getElementById("terminalModeLabel");
const analysisProgress = document.getElementById("analysisProgress");
const resultActions = document.getElementById("resultActions");
const resultText = document.getElementById("resultText");
const systemStatus = document.getElementById("systemStatus");
const deviceDisplay = document.getElementById("deviceDisplay");
const isIPhonePage = /\/iphone\.html$/i.test(window.location.pathname);

let audioCtx = null, masterGain = null, analysisHumNodes = [], analysisTickTimer = null;
let soundEnabled = localStorage.getItem("prescript_sound_v1") !== "off";

function ensureAudio(){if(!soundEnabled)return null;const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;if(!audioCtx){audioCtx=new A();masterGain=audioCtx.createGain();masterGain.gain.value=.78;masterGain.connect(audioCtx.destination)}if(audioCtx.state==="suspended")audioCtx.resume().catch(()=>{});return audioCtx}
function tone(freq,duration,volume=.08,type="sine",startOffset=0,endFreq=null){const ctx=ensureAudio();if(!ctx||!masterGain)return;const now=ctx.currentTime+startOffset,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,now);if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),now+duration);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(gain);gain.connect(masterGain);osc.start(now);osc.stop(now+duration+.03)}
function noiseBurst(duration=.05,volume=.035,center=5200,q=1.5,startOffset=0){const ctx=ensureAudio();if(!ctx||!masterGain)return;const n=Math.max(1,Math.floor(ctx.sampleRate*duration)),buffer=ctx.createBuffer(1,n,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;const src=ctx.createBufferSource();src.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type="bandpass";filter.frequency.value=center;filter.Q.value=q;const gain=ctx.createGain(),now=ctx.currentTime+startOffset;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),now+.004);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);src.connect(filter);filter.connect(gain);gain.connect(masterGain);src.start(now);src.stop(now+duration+.02)}
function playButtonClick(){if(!soundEnabled)return;tone(1180,.025,.026,"square");noiseBurst(.018,.02,6500,2.4,.003)}
function playReceiveStart(){}
function startAnalysisSound(){stopAnalysisSound();const ctx=ensureAudio();if(!ctx||!masterGain)return;const now=ctx.currentTime,carrierGain=ctx.createGain();carrierGain.gain.setValueAtTime(.0001,now);carrierGain.gain.exponentialRampToValueAtTime(.010,now+.10);carrierGain.connect(masterGain);const bedA=ctx.createOscillator();bedA.type="sine";bedA.frequency.value=82;bedA.connect(carrierGain);bedA.start(now);const bedB=ctx.createOscillator();bedB.type="triangle";bedB.frequency.value=164;const bedBGain=ctx.createGain();bedBGain.gain.value=.22;bedB.connect(bedBGain);bedBGain.connect(carrierGain);bedB.start(now);analysisHumNodes=[bedA,bedB,carrierGain,bedBGain];let packetIndex=0;const sendPacket=()=>{if(!soundEnabled||!audioCtx)return;packetIndex++;const bands=[6050,6640,7180,7730,8420,9050],hf=bands[(packetIndex*5+2)%bands.length]+(Math.random()-.5)*180;tone(hf,.007+Math.random()*.006,.009,"square");noiseBurst(.010+Math.random()*.006,.008,hf,7.8,.001);if(packetIndex%6===0||packetIndex%11===0)noiseBurst(.012,.0075,5200+Math.random()*1100,6.5,.002)};sendPacket();analysisTickTimer=setInterval(sendPacket,61)}
function stopAnalysisSound(){if(analysisTickTimer){clearInterval(analysisTickTimer);analysisTickTimer=null}if(!audioCtx){analysisHumNodes=[];return}const now=audioCtx.currentTime;analysisHumNodes.forEach(node=>{try{if(node.gain){node.gain.cancelScheduledValues(now);node.gain.setValueAtTime(Math.max(.0001,node.gain.value||.001),now);node.gain.exponentialRampToValueAtTime(.0001,now+.09)}}catch{}});setTimeout(()=>{analysisHumNodes.forEach(node=>{try{if(node.stop)node.stop()}catch{}try{node.disconnect()}catch{}});analysisHumNodes=[]},130)}
function playAnalysisLock(){if(!soundEnabled)return;noiseBurst(.028,.014,8200,7,.012);tone(7350,.018,.012,"sine",.018,8100)}
function playPrescriptReceived(){if(!soundEnabled)return;const ctx=ensureAudio();if(!ctx)return;const packetCount=24,interval=.021;for(let i=0;i<packetCount;i++){const t=i*interval,lane=i%6,base=[7050,7480,7920,8350,8840,9320][lane],freq=base+((i*37)%83)-41;tone(freq,.009+(i%3)*.002,.0095,"square",t);noiseBurst(.008,.0055,freq,9,t+.001);if(i===7||i===15||i===23)noiseBurst(.010,.0055,5900,6.5,t+.005)}const end=packetCount*interval+.015;tone(8220,.028,.010,"sine",end,8700);tone(9650,.022,.0065,"sine",end+.010,9300)}
function playCompleteSound(){if(!soundEnabled)return;tone(420,.06,.04,"square");tone(620,.09,.035,"square",.055);tone(980,.1,.028,"sine",.11)}
function updateSoundButton(){if(!soundButton)return;soundButton.textContent=soundEnabled?"SOUND ON":"SOUND OFF";soundButton.setAttribute("aria-pressed",String(soundEnabled));soundButton.classList.toggle("muted",!soundEnabled)}
function setSoundEnabled(enabled){soundEnabled=enabled;localStorage.setItem("prescript_sound_v1",enabled?"on":"off");if(!enabled)stopAnalysisSound();updateSoundButton()}
function loadJson(key,fallback){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):structuredClone(fallback)}catch{return structuredClone(fallback)}}
function saveState(){localStorage.setItem(STORAGE_COMMANDS,JSON.stringify(commands));localStorage.setItem(STORAGE_HISTORY,JSON.stringify(history))}
function showView(name){Object.values(views).forEach(view=>{if(view)view.classList.remove("active")});if(views[name])views[name].classList.add("active")}
function updateCounts(){document.getElementById("commandCount").textContent=commands.length;document.getElementById("historyCount").textContent=history.length}
function randomCommand(){return commands[Math.floor(Math.random()*commands.length)]}
function getResponsiveLineCount(){return isIPhonePage?3:2}
function fitCodeMatrixFont(lineCount=getResponsiveLineCount()){if(!candidateText)return;const screen=document.querySelector(".decoding-screen");if(!screen)return;candidateText.dataset.lines=String(lineCount);const width=Math.max(1,screen.clientWidth);let size;if(isIPhonePage){size=width>=340?16:14}else if(width>=700){size=27}else if(width>=560){size=24}else if(width>=430){size=21}else if(width>=340){size=17}else{size=14}candidateText.style.setProperty("--matrix-font-size",`${size}px`);const maxWidth=Math.max(1,candidateText.clientWidth-6);let guard=0;while(guard<16&&candidateText.scrollWidth>maxWidth&&size>12){size-=.5;candidateText.style.setProperty("--matrix-font-size",`${size}px`);guard++}}

async function receivePrescript(){
  if(commands.length===0){alert("指令が登録されていません。先に指令を追加してください。");commandDialog.showModal();return}
  receiveButton.disabled=true;ensureAudio();playReceiveStart();showView("decoding");systemStatus.textContent="DECODING";terminalModeLabel.textContent="DECODING";screenTitle.textContent="// ANALYZING";screenFoot.textContent="PRESCRIPT ENGINE ACTIVE";decodingPhase.textContent="INITIALIZE";progressBar.style.width="0%";analysisProgress.classList.remove("output-ready");decodingText.classList.remove("output-ready");decodingText.textContent="指令を解析中...";resultActions.classList.remove("visible");resultText.classList.remove("revealing");resultText.textContent="";resultText.style.display="none";resultText.style.opacity="";resultText.style.visibility="";candidateText.style.display="grid";candidateText.classList.remove("dissolving");candidateText.classList.add("scramble");decodingTerminal?.classList.remove("output-mode","finalizing");decodingTerminal?.classList.add("active-pulse");
  const chars="A7F29C4D3B1EF0A96D2C81X7V5KQZ",sigils=["⟦","⟪","⌁","◇","∷","╱","∆","0X","RX","QF"],tails=["⟧","⟫","∷","◇","⌁","╲","∆","NX","FF"];
  function randomBlock(len=4){let out="";for(let i=0;i<len;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out}
  function randomCodeLine(){const sigil=sigils[Math.floor(Math.random()*sigils.length)],tail=tails[Math.floor(Math.random()*tails.length)],route=String(Math.floor(Math.random()*97)).padStart(2,"0");return isIPhonePage?`${sigil}${route}∷${randomBlock(3)}·${randomBlock(3)}╱${randomBlock(3)}-${randomBlock(3)}${tail}`:`${sigil}${route}∷${randomBlock(4)}·${randomBlock(4)}╱${randomBlock(4)}-${randomBlock(4)}╱${randomBlock(4)}·${randomBlock(4)}${tail}`}
  function renderCodeMatrix(){const count=getResponsiveLineCount();candidateText.innerHTML=Array.from({length:count},()=>`<div>${randomCodeLine()}</div>`).join("");requestAnimationFrame(()=>fitCodeMatrixFont(count))}
  const phases=["0X_A1","RX_7F","VX_3C","QF_91","NX_0D","PX_A8","ZX_44"],totalSteps=17;let step=0;startAnalysisSound();
  await new Promise(resolve=>{const timer=setInterval(()=>{step++;progressBar.style.width=`${Math.min(100,Math.round(step/totalSteps*100))}%`;decodingPhase.textContent=phases[Math.min(phases.length-1,Math.floor(step/totalSteps*phases.length))];if(step%2===0)renderCodeMatrix();if(step>=totalSteps){clearInterval(timer);resolve()}},105)});
  stopAnalysisSound();playAnalysisLock();candidateText.classList.remove("scramble");decodingTerminal?.classList.remove("active-pulse");decodingTerminal?.classList.add("finalizing");decodingPhase.textContent="0X_FF";
  candidateText.innerHTML=isIPhonePage?`<div>⟦17∷A7F·9C4╱3B1-F0A⟧</div><div>◇42∷V5K·Z7F╱C91-0A6◇</div><div>RX08∷D2C·81X╱B43-F82FF</div>`:`<div>⟦17∷A7F2·9C4D╱3B1E-F0A9╱6D2C·81X7⟧</div><div>◇42∷V5KQ·Z7F2╱C91D-0A6E╱B431·F82X◇</div>`;
  fitCodeMatrixFont(getResponsiveLineCount());await wait(360);decodingPhase.textContent="RX_OK";progressBar.style.width="100%";await wait(260);
  const chosen=randomCommand(),entry={id:crypto.randomUUID(),text:chosen,done:false,receivedAt:new Date().toISOString()};history.unshift(entry);currentHistoryId=entry.id;saveState();renderHistory();updateCounts();candidateText.classList.add("dissolving");await wait(430);candidateText.style.display="none";playPrescriptReceived();decodingTerminal?.classList.remove("finalizing");decodingTerminal?.classList.add("output-mode");terminalModeLabel.textContent="PRESCRIPT RECEIVED";screenTitle.textContent="// PRESCRIPT";decodingPhase.textContent="CONFIRMED";screenFoot.textContent="OBEY / EXECUTE";systemStatus.textContent="PRESCRIPT RECEIVED";analysisProgress.classList.add("output-ready");decodingText.classList.add("output-ready");resultText.textContent=chosen;resultText.style.display="block";resultText.style.opacity="1";resultText.style.visibility="visible";resultText.classList.remove("revealing");void resultText.offsetWidth;resultText.classList.add("revealing");await wait(560);resultActions.classList.add("visible");receiveButton.disabled=false
}

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function renderHistory(){const list=document.getElementById("historyList");list.innerHTML="";if(history.length===0){list.innerHTML='<div class="empty-state">まだ履歴はありません。</div>';return}history.forEach(item=>{const el=document.createElement("div");el.className=`history-item ${item.done?"done":""}`;el.innerHTML=`<div class="history-meta">${new Date(item.receivedAt).toLocaleString("ja-JP")}</div><div class="history-text"></div>`;el.querySelector(".history-text").textContent=item.text;list.appendChild(el)})}
function renderCommandList(){const list=document.getElementById("commandList");list.innerHTML="";commands.forEach((command,index)=>{const item=document.createElement("div");item.className="command-item";const text=document.createElement("span");text.textContent=command;const del=document.createElement("button");del.textContent="削除";del.addEventListener("click",()=>{playButtonClick();commands.splice(index,1);saveState();renderCommandList();updateCounts()});item.append(text,del);list.appendChild(item)})}
receiveButton.addEventListener("click",receivePrescript);retryButton.addEventListener("click",()=>{playButtonClick();receivePrescript()});completeButton.addEventListener("click",()=>{playCompleteSound();if(!currentHistoryId)return;const target=history.find(item=>item.id===currentHistoryId);if(target)target.done=true;saveState();renderHistory();showView("idle")});settingsButton.addEventListener("click",()=>{playButtonClick();renderCommandList();commandDialog.showModal()});soundButton?.addEventListener("click",()=>setSoundEnabled(!soundEnabled));addCommandButton.addEventListener("click",()=>{playButtonClick();const value=commandInput.value.trim();if(!value)return;commands.push(value);commandInput.value="";saveState();renderCommandList();updateCounts()});resetCommandsButton.addEventListener("click",()=>{playButtonClick();commands=structuredClone(defaultCommands);saveState();renderCommandList();updateCounts()});clearHistoryButton.addEventListener("click",()=>{playButtonClick();history=[];currentHistoryId=null;saveState();renderHistory();updateCounts()});commandDialog.addEventListener("click",event=>{if(event.target===commandDialog)commandDialog.close()});
updateSoundButton();renderHistory();updateCounts();showView("idle");
