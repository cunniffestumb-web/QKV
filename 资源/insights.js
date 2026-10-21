/* V3 interpretation layer. All statements derive from actual model state/history. */
(function(root){
 'use strict';
 function waveText(w){
  if(!w)return '正在观察，等待足够轨迹';
  if(w.valid)return '低速区向'+(w.direction==='backward'?'后':'前')+'传播，估计约'+Math.abs(w.speed_m_s*3.6).toFixed(1)+' km/h';
  const s=w.label||'';
  if(s.includes('多个')||s.includes('多簇')||s.includes('分散'))return '低速区较分散，暂不能判断单一方向';
  if(s.includes('静止'))return '低速区接近静止，传播方向尚不明确';
  if(s.includes('不规则'))return '低速区仍在变化，暂不能稳定判断方向';
  if(s.includes('无低速'))return '正在观察，当前尚无明显低速区';
  return '正在观察，等待足够的低速区轨迹';
 }
 function waveDetails(w){
  if(!w)return '等待记录轨迹。';
  const fit=Number.isFinite(w.r2)?' 本次拟合 R²='+w.r2.toFixed(3)+'，有效快照 '+w.count+' 个。':'';
  return (w.method||'')+fit+' 判定：'+w.label;
 }
 function observation(s,w){
  const p=s.sim.params,m=s.sim.metrics(),desired=p.v0*3.6,equilibrium=root.TrafficEngine.equilibriumSpeed(p.N,p)*3.6;
  if(s.sim.active){const b=s.sim.active;return (b.id+1)+'号车正在短暂制动，后车根据实际间距与相对速度响应。观察红色制动反馈和后续轨迹。';}
  if(w&&w.valid&&m.minV<.5)return '已有车辆低速行驶或短暂停车；车辆整体仍向前行驶。'+waveText(w)+'。';
  if(m.minV<.5)return '已有车辆进入低速或短暂停车状态。'+waveText(w)+'，继续观察它是否形成持续传播。';
  if(s.sim.t<20)return '期望速度 '+desired.toFixed(0)+' km/h 是畅通时的目标；当前间距下的均匀跟车速度约 '+equilibrium.toFixed(1)+' km/h，实际全环均速为 '+m.V.toFixed(1)+' km/h。';
  if(m.stdV<.3)return '当前全环均速 '+m.V.toFixed(1)+' km/h，车速差异较小。这个场景尚未形成明显的停车起步波。';
  return '车辆速度差异正在演变，当前全环均速 '+m.V.toFixed(1)+' km/h。'+waveText(w)+'。';
 }
 function windowStats(history,start,end,params){
  const first=history.find(r=>Math.abs(r.t-start)<1e-7),last=history.find(r=>Math.abs(r.t-end)<1e-7);
  if(!first||!last||end<=start)return null;
  const travelled=last.unwrapped.reduce((sum,x,i)=>sum+x-first.unwrapped[i],0);
  const V=travelled/params.N/(end-start)*3.6,K=params.N/(params.L/1000);
  return {start_s:start,end_s:end,duration_s:end-start,K,V,Q:K*V,method:'Mean cumulative vehicle displacement / N / elapsed time; V in km/h, K in veh/km, Q=K*V in veh/h.'};
 }
 function demoSummary(s,w){
  const end=s.sim.t,params={...s.sim.params};
  return {duration_s:end,params,whole:windowStats(s.history,0,end,params),recent:windowStats(s.history,Math.max(0,end-30),end,params),end_state:s.sim.metrics(),wave:w?JSON.parse(JSON.stringify(w)):null,wave_text:waveText(w)};
 }
 function sampleSummary(samples){
  if(!samples.length)return null;
  const peak=samples.reduce((a,b)=>b.Q>a.Q?b:a);
  return {sample_count:samples.length,N:peak.N,K:peak.K,V:peak.V,Q:peak.Q,params:{...peak.params},warmup_s:peak.warmup_s,duration_s:peak.duration_s,scope:'Maximum among this finite set of independent-density simulation time means; not a continuous optimum or empirical capacity.'};
 }
 const api={waveText,waveDetails,observation,windowStats,demoSummary,sampleSummary};root.TrafficInsights=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
