/* V2 chart layer: real histories and independent-density samples, offline canvas. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = {grid:'#203349',axis:'#6f8ca4',text:'#b4cbde',cyan:'#65e5ed',purple:'#b09af5',coral:'#ff8d7c',bg:'#0c1c30'};
  const ids=['qk','vk','qv'];
  const mod=(x,L)=>((x%L)+L)%L;
  let cache, lastState;
  const boundCanvases=new WeakSet();
  function clock(s){return Number.isFinite(s.chartClock)?s.chartClock:s.sim.t;}
  function reset(s){
    cache={origin:clock(s),seen:new Map(),hover:null,pointer:null,theoryKey:'',theory:[],waveKey:null,wave:null,hits:{}};
    lastState=s;
    const tooltip=$('charts-tooltip');if(tooltip)tooltip.style.display='none';
    API.hitPoints={};
  }
  function text(id,value){const e=$(id);if(e&&e.textContent!==value)e.textContent=value;}
  function axes(c,w,h,xMax,yMin,yMax,xLabel,yLabel){
    const a={l:w<300?48:58,r:w-16,t:30,b:h-43};
    a.x=v=>a.l+v/xMax*(a.r-a.l);a.y=v=>a.b-(v-yMin)/Math.max(1e-9,yMax-yMin)*(a.b-a.t);
    c.font='11px "Microsoft YaHei",sans-serif';c.textBaseline='middle';c.lineWidth=1;
    for(let j=0;j<=4;j++){
      const yv=yMin+(yMax-yMin)*j/4,y=a.y(yv),xv=xMax*j/4,x=a.x(xv);
      c.strokeStyle=C.grid;c.beginPath();c.moveTo(a.l,y);c.lineTo(a.r,y);c.stroke();
      c.fillStyle=C.axis;c.textAlign='right';c.fillText(formatTick(yv,yMax-yMin),a.l-8,y);
      c.textAlign='center';c.fillText(formatTick(xv,xMax),x,a.b+17);
    }
    c.strokeStyle='#496178';c.beginPath();c.moveTo(a.l,a.t);c.lineTo(a.l,a.b);c.lineTo(a.r,a.b);c.stroke();
    c.fillStyle=C.text;c.textAlign='left';c.fillText(yLabel,Math.max(5,a.l-39),12);c.textAlign='right';c.fillText(xLabel,a.r,h-8);
    return a;
  }
  function formatTick(v,span){return span>=50?v.toFixed(0):span>=8?v.toFixed(1):v.toFixed(2);}
  function clip(c,a){c.save();c.beginPath();c.rect(a.l,a.t,a.r-a.l,a.b-a.t);c.clip();}
  function line(c,x1,y1,x2,y2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
  function trajectory(s){
    const canvas=$('trajectory');if(!canvas)return;
    const {c,w,h}=root.TrafficViz.setup(canvas),now=s.sim.t,low=Math.max(0,now-180),high=Math.max(30,now+2),L=s.params.L;
    const a=axes(c,w,h,L,low,high,'位置 x (m) → 车辆正方向','时间 t (s) ↑ 最新');
    const hist=s.history;let start=hist.length-1;while(start>0&&hist[start-1].t>=low)start--;
    clip(c,a);
    for(let selectedPass=0;selectedPass<2;selectedPass++){
      c.lineWidth=selectedPass?2.7:1.15;c.globalAlpha=selectedPass?1:.67;
      for(let j=Math.max(1,start);j<hist.length;j++){
        const p=hist[j-1],q=hist[j];
        for(let i=0;i<q.x.length;i++){
          if((i===s.selected)!==!!selectedPass)continue;
          c.strokeStyle=root.TrafficViz.color((p.v[i]+q.v[i])/2);
          // Split at each circular seam, preserving the genuine forward segment at both edges.
          const u=p.unwrapped?p.unwrapped[i]:p.x[i];
          const un=q.unwrapped?q.unwrapped[i]:u+mod(q.x[i]-p.x[i],L),dx=un-u;
          if(dx< -1e-7||dx>L*2)continue;
          const x0=mod(u,L),nextSeam=(Math.floor(u/L)+1)*L;
          if(un>=nextSeam&&dx>1e-9){
            const f=(nextSeam-u)/dx,bt=p.t+(q.t-p.t)*f;
            line(c,a.x(x0),a.y(p.t),a.x(L),a.y(bt));
            line(c,a.x(0),a.y(bt),a.x(mod(un,L)),a.y(q.t));
          }else line(c,a.x(x0),a.y(p.t),a.x(mod(un,L)),a.y(q.t));
        }
      }
    }
    c.globalAlpha=1;
    const latest=hist[hist.length-1];
    if(latest){
      for(let i=0;i<latest.x.length;i++){
        const col=root.TrafficViz.color(latest.v[i]),selected=i===s.selected;
        c.fillStyle=col;c.shadowColor=col;c.shadowBlur=selected?12:5;c.beginPath();c.arc(a.x(latest.x[i]),a.y(latest.t),selected?4:2,0,Math.PI*2);c.fill();
        if(selected){c.shadowBlur=0;c.strokeStyle='#fff';c.lineWidth=1;c.stroke();}
      }
      c.shadowBlur=0;
    }
    c.restore();
    if(hist.length<3){c.fillStyle=C.axis;c.textAlign='center';c.fillText('运行后记录车辆轨迹；彩色亮点为最新位置',w/2,h/2);}
    const wave=waveEstimate(s);
    text('wave-status',root.TrafficInsights.waveText(wave));text('wave-method',root.TrafficInsights.waveDetails(wave));
  }
  function cluster(r,L){
    const slow=[];for(let i=0;i<r.v.length;i++)if(r.v[i]<.5)slow.push(i);
    if(slow.length<2)return {valid:false,count:slow.length,reason:'few'};
    const slowSet=new Set(slow),n=r.v.length;
    let groups=0;for(const i of slow)if(!slowSet.has((i+n-1)%n))groups++;
    if(groups>1)return {valid:false,count:slow.length,reason:'multiple'};
    let cx=0,cy=0;for(const i of slow){const phi=r.x[i]/L*2*Math.PI;cx+=Math.cos(phi);cy+=Math.sin(phi);}
    const resultant=Math.hypot(cx,cy)/slow.length;
    if(resultant<.3)return {valid:false,count:slow.length,reason:'diffuse'};
    return {valid:true,angle:Math.atan2(cy,cx),count:slow.length};
  }
  function waveEstimate(s){
    const hist=s.history,last=hist[hist.length-1],key=last?last.t+':'+hist.length+':'+s.params.L:'none';
    if(cache.waveKey===key)return cache.wave;
    const method='低速车 v < 0.5 m/s（1.8 km/h），每帧至少 2 辆；近 30 s 环形角质心展开后线性拟合，至少 20 个有效快照。仅估计质心方向，不代表拥堵前沿。';
    let result={label:'数据不足 · 等待低速区形成',method,valid:false,direction:null};
    if(!last){cache.waveKey=key;return cache.wave=result;}
    const latest=cluster(last,s.params.L);
    if(!latest.valid){
      result.label=latest.reason==='multiple'?'存在多个低速簇 · 不估计单一波速':latest.reason==='diffuse'?'低速车分布分散 · 质心方向不确定':latest.count===0?'当前无低速簇 · 未检测到低速车':'数据不足 · 当前仅 1 辆低速车';
      cache.waveKey=key;return cache.wave=result;
    }
    const records=[];let bad=0;
    for(let j=hist.length-1;j>=0&&hist[j].t>=last.t-30;j--){
      const z=cluster(hist[j],s.params.L);if(z.valid)records.push({t:hist[j].t,angle:z.angle});else if(z.reason==='multiple'||z.reason==='diffuse')bad++;
    }
    records.reverse();
    if(records.length<20||records[records.length-1].t-records[0].t<4.5)result.label='数据不足 · 低速区有效快照 '+records.length+' / 20';
    else if(bad>records.length*.2)result.label='近期低速区多簇或分散 · 方向不确定';
    else {
      // Stop at any > 1 s hole: jumping between unrelated clusters can create a false speed.
      let cut=0;for(let j=1;j<records.length;j++)if(records[j].t-records[j-1].t>1)cut=j;
      const rr=records.slice(cut);
      if(rr.length<20)result.label='数据不足 · 连续低速区快照 '+rr.length+' / 20';
      else{
        let angle=rr[0].angle;const xy=rr.map((p,j)=>{
          if(j){let d=p.angle-rr[j-1].angle;d=Math.atan2(Math.sin(d),Math.cos(d));angle+=d;}
          return {x:p.t-rr[0].t,y:angle*s.params.L/(2*Math.PI)};
        });
        const n=xy.length,mx=xy.reduce((z,p)=>z+p.x,0)/n,my=xy.reduce((z,p)=>z+p.y,0)/n;
        let xx=0,yy=0,xySum=0;for(const p of xy){xx+=(p.x-mx)**2;yy+=(p.y-my)**2;xySum+=(p.x-mx)*(p.y-my);}
        const slope=xx?xySum/xx:0,intercept=my-slope*mx;
        const residual=xy.reduce((z,p)=>z+(p.y-intercept-slope*p.x)**2,0),r2=yy>1e-8?Math.max(0,1-residual/yy):0;
        const se=Math.sqrt(residual/Math.max(1,n-2)/Math.max(1e-9,xx));
        result={...result,speed_m_s:slope,r2,count:n,centroid:true};
        if(Math.abs(slope)<.15||Math.abs(slope)<2*se)result.label='低速区质心近似静止或方向不确定';
        else if(r2<.55)result.label='低速区变化不规则 · 单一方向不确定（R²='+r2.toFixed(2)+'）';
        else {result.valid=true;result.direction=slope<0?'backward':'forward';result.label='低速区质心'+(slope<0?'逆行':'顺行')+' ≈ '+Math.abs(slope*3.6).toFixed(1)+' km/h · R²='+r2.toFixed(2)+' · '+n+' 帧';}
      }
    }
    cache.waveKey=key;return cache.wave=result;
  }
  function theory(s){
    const p=s.params,key=[p.L,p.v0,p.T,p.s0,p.length,p.delta||4].join(':');
    if(cache.theoryKey!==key){
      const pts=[],kmax=1000/(p.length+p.s0);
      for(let i=0;i<=160;i++){
        const K=kmax*i/160,V=i===0?p.v0*3.6:root.TrafficEngine.equilibriumSpeed(K*p.L/1000,p)*3.6;
        pts.push({K,V,Q:K*V});
      }
      cache.theory=pts;cache.theoryKey=key;
    }
    return cache.theory;
  }
  function niceMax(v){if(v<=0)return 1;const pow=10**Math.floor(Math.log10(v));return Math.ceil(v/pow/2)*2*pow;}
  function install(canvas,id){
    if(boundCanvases.has(canvas))return;boundCanvases.add(canvas);
    canvas.style.cursor='crosshair';
    canvas.addEventListener('mousemove',ev=>{
      const r=canvas.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top;
      let nearest=null,dist=14;
      for(const p of (API.hitPoints[id]||[])){const d=Math.hypot(p.x-x,p.y-y);if(d<dist){dist=d;nearest=p;}}
      cache.hover=nearest?{source:nearest.source,sample:nearest.sample}:null;
      cache.pointer={x:ev.clientX,y:ev.clientY};canvas.style.cursor=nearest?'pointer':'crosshair';
      tooltip(lastState);
    });
    canvas.addEventListener('mouseleave',()=>{cache.hover=null;cache.pointer=null;tooltip(lastState);});
  }
  function tooltip(s){
    const el=$('charts-tooltip'),hover=cache.hover;
    if(!el)return;
    if(!hover||!s){el.style.display='none';text('linked-state','将鼠标移到数据点，联动查看三个关系图');return;}
    const p=hover.source==='current'?{...s.sim.metrics(),N:s.params.N}:hover.sample;
    const name=hover.source==='current'?'当前全环瞬时状态':'独立仿真采样';
    text('linked-state',name+' · N='+p.N+' 辆 · K='+p.K.toFixed(1)+' 辆/km · V='+p.V.toFixed(1)+' km/h · Q='+p.Q.toFixed(0)+' 辆/h');
    el.textContent=name+'\nN  '+p.N+' 辆\nK  '+p.K.toFixed(2)+' 辆/km\nV  '+p.V.toFixed(2)+' km/h\nQ  '+p.Q.toFixed(1)+' 辆/h';
    Object.assign(el.style,{display:'block',position:'fixed',zIndex:'100',pointerEvents:'none',whiteSpace:'pre-line',background:'#10283ef5',border:'1px solid #6ddfe9',borderRadius:'10px',padding:'11px 15px',color:'#e0f5ff',font:'12px/1.8 "Microsoft YaHei",sans-serif',boxShadow:'0 10px 32px #0008',maxWidth:'260px'});
    const pos=cache.pointer||{x:50,y:50},vw=root.innerWidth||1200,vh=root.innerHeight||800;
    el.style.left=Math.max(8,Math.min(vw-246,pos.x+16))+'px';el.style.top=Math.max(8,Math.min(vh-190,pos.y+16))+'px';
  }
  function point(c,x,y,r,current,col){
    c.beginPath();if(current){c.moveTo(x,y-r-1);c.lineTo(x+r+1,y);c.lineTo(x,y+r+1);c.lineTo(x-r-1,y);c.closePath();}else c.arc(x,y,r,0,Math.PI*2);
    c.fillStyle=col;c.fill();c.strokeStyle=current?'#e4fbff':'#132d43';c.lineWidth=current?1.4:1;c.stroke();
  }
  function plots(s){
    const pts=theory(s),live={...s.sim.metrics(),N:s.params.N},all=[...pts,...s.samples,live];
    const qmax=niceMax(Math.max(...all.map(p=>p.Q))*1.08),vmax=niceMax(Math.max(s.params.v0*3.6,...all.map(p=>p.V))*1.07),kmax=niceMax(1000/(s.params.length+s.params.s0)*1.04);
    const clockNow=clock(s);
    if(s.paused||s.reduceMotion)cache.origin=Math.min(cache.origin,clockNow-.8);
    const progress=(s.reduceMotion||s.paused)?1:Math.max(0,Math.min(1,(clockNow-cache.origin)/.8));
    for(const sample of s.samples){
      if(!cache.seen.has(sample))cache.seen.set(sample,clockNow);
      if(s.paused||s.reduceMotion)cache.seen.set(sample,Math.min(cache.seen.get(sample),clockNow-.5));
    }
    const configs=[['qk','K','Q',kmax,qmax,'K (辆/km)','Q (辆/h)'],['vk','K','V',kmax,vmax,'K (辆/km)','V (km/h)'],['qv','V','Q',vmax,qmax,'V (km/h)','Q (辆/h)']];
    for(const [id,xkey,ykey,xmax,ymax,xlabel,ylabel] of configs){
      const canvas=$(id);if(!canvas)continue;install(canvas,id);
      const {c,w,h}=root.TrafficViz.setup(canvas),a=axes(c,w,h,xmax,0,ymax,xlabel,ylabel),hits=[];
      clip(c,a);c.strokeStyle=C.purple;c.lineWidth=1.7;c.setLineDash([5,5]);c.beginPath();
      const end=Math.max(1,Math.ceil((pts.length-1)*progress));
      for(let i=0;i<=end;i++){const p=pts[Math.min(i,pts.length-1)];if(i)c.lineTo(a.x(p[xkey]),a.y(p[ykey]));else c.moveTo(a.x(p[xkey]),a.y(p[ykey]));}c.stroke();c.setLineDash([]);
      for(const p of s.samples){
        const appearance=(s.reduceMotion||s.paused)?1:Math.max(0,Math.min(1,(clockNow-cache.seen.get(p))/.5));
        const scale=1-Math.pow(1-appearance,3),x=a.x(p[xkey]),y=a.y(p[ykey]),selected=cache.hover&&cache.hover.sample===p&&cache.hover.source==='sample';
        c.globalAlpha=.15+.85*appearance;point(c,x,y,(selected?6:4.5)*Math.max(.2,scale),false,root.TrafficViz.color(p.V/3.6));c.globalAlpha=1;
        hits.push({id,x,y,source:'sample',sample:p,N:p.N,K:p.K,V:p.V,Q:p.Q});
      }
      const lx=a.x(live[xkey]),ly=a.y(live[ykey]);
      c.shadowColor=C.cyan;c.shadowBlur=s.reduceMotion?0:8;point(c,lx,ly,5.5,true,root.TrafficViz.color(live.V/3.6));c.shadowBlur=0;
      hits.push({id,x:lx,y:ly,source:'current',sample:null,...live});
      if(cache.hover){
        const p=cache.hover.source==='current'?live:cache.hover.sample;
        if(p){
          const x=a.x(p[xkey]),y=a.y(p[ykey]);c.strokeStyle=C.cyan;c.lineWidth=1;c.setLineDash([3,4]);line(c,a.l,y,a.r,y);line(c,x,a.t,x,a.b);c.setLineDash([]);
          c.strokeStyle='#e7fcff';c.lineWidth=2;c.beginPath();c.arc(x,y,10,0,Math.PI*2);c.stroke();
        }
      }
      c.restore();API.hitPoints[id]=hits;
    }
    s.plotHitPoints=API.hitPoints;tooltip(s);
  }
  function spark(s,key,id,col){
    const canvas=$(id);if(!canvas)return;const {c,w,h}=root.TrafficViz.setup(canvas);
    const hist=s.history,last=hist[hist.length-1];if(!last)return;
    let start=hist.length-1;while(start>0&&hist[start-1].t>=last.t-60)start--;
    const rows=hist.slice(start),values=rows.map(r=>r[key]),min=Math.min(...values),max=Math.max(...values),span=max-min;
    // A minimum meaningful range prevents tiny rounding changes from looking like large swings.
    const meaningful=Math.max(.1,Math.abs(max)*.05);
    const lo=span<meaningful?(max+min)/2-meaningful:min-span*.15,hi=span<meaningful?(max+min)/2+meaningful:max+span*.15;
    const x=t=>3+(t-Math.max(0,last.t-60))/Math.max(1,Math.min(60,last.t))*(w-6),y=v=>h-4-(v-lo)/(hi-lo)*(h-8);
    c.strokeStyle='#29425b';c.lineWidth=1;line(c,0,h-3,w,h-3);c.strokeStyle=col;c.lineWidth=1.6;c.beginPath();
    rows.forEach((r,i)=>i?c.lineTo(x(r.t),y(r[key])):c.moveTo(x(r.t),y(r[key])));c.stroke();
    c.fillStyle=col;c.beginPath();c.arc(x(last.t),y(last[key]),2.3,0,Math.PI*2);c.fill();
    canvas.setAttribute('aria-label','最近60秒'+({Q:'流量',K:'密度',V:'速度'}[key])+'趋势；当前'+last[key].toFixed(1));
  }
  const API={draw(s,wallTimeMs){
    if(!cache||lastState!==s)reset(s);lastState=s;
    if(!s.sim||!root.TrafficViz)return;
    trajectory(s);plots(s);spark(s,'Q','spark-q',C.cyan);spark(s,'K','spark-k',C.purple);spark(s,'V','spark-v',C.coral);
    API.waveEstimate=cache.wave;
  },reset,hitPoints:{},waveEstimate:null};
  root.TrafficCharts=API;
})(window);
