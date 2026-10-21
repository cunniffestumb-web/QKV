/* Elliptical view of the physical ring: visual projection only, no dynamics. */
(function(root){
  'use strict';
  const TAU=Math.PI*2;
  function geometry(w,h){return {cx:w*.50,cy:h*.48,rx:Math.min(w*.385,370),ry:Math.min(h*.345,125),road:24};}
  function point(x,L,g){const a=x/L*TAU-Math.PI/2;return {x:g.cx+g.rx*Math.cos(a),y:g.cy+g.ry*Math.sin(a),a,heading:Math.atan2(g.ry*Math.cos(a),-g.rx*Math.sin(a))};}
  function ellipse(c,g,rx,ry,y=0){c.beginPath();c.ellipse(g.cx,g.cy+y,rx,ry,0,0,TAU);}
  function drawFloor(c,g,w,h){
    c.save();c.lineWidth=.7;c.strokeStyle='#37657a20';
    for(let i=1;i<=4;i++){ellipse(c,g,g.rx+20+i*20,g.ry+12+i*10,5);c.stroke();}
    for(let i=0;i<20;i++){const a=i/20*TAU;c.beginPath();c.moveTo(g.cx+Math.cos(a)*(g.rx+22),g.cy+Math.sin(a)*(g.ry+12)+5);c.lineTo(g.cx+Math.cos(a)*(g.rx+108),g.cy+Math.sin(a)*(g.ry+55)+5);c.stroke();}
    c.strokeStyle='#3c798728';c.setLineDash([1,7]);c.beginPath();c.moveTo(15,g.cy+g.ry+31);c.lineTo(w-15,g.cy+g.ry+31);c.stroke();c.setLineDash([]);c.restore();
  }
  function drawRoad(c,g){
    c.save();c.lineWidth=g.road+6;c.strokeStyle='#06101c';ellipse(c,g,g.rx,g.ry,7);c.shadowColor='#000b';c.shadowBlur=15;c.shadowOffsetY=8;c.stroke();c.shadowBlur=0;c.shadowOffsetY=0;
    // A raised road deck and a bright, thin cyan lip create depth without obscuring cars.
    c.strokeStyle='#163747';c.lineWidth=g.road+4;ellipse(c,g,g.rx,g.ry,4);c.stroke();
    const deck=c.createLinearGradient(0,g.cy-g.ry,0,g.cy+g.ry);deck.addColorStop(0,'#152a3c');deck.addColorStop(.5,'#0e2334');deck.addColorStop(1,'#183446');c.lineWidth=g.road;c.strokeStyle=deck;ellipse(c,g,g.rx,g.ry);c.stroke();
    c.lineWidth=1.1;c.strokeStyle='#39cdd5a8';c.shadowColor='#28d1dc';c.shadowBlur=7;ellipse(c,g,g.rx+13,g.ry+13);c.stroke();ellipse(c,g,g.rx-13,g.ry-13);c.stroke();c.shadowBlur=0;
    c.strokeStyle='#79d7e42b';c.lineWidth=.7;c.setLineDash([3,9]);ellipse(c,g,g.rx,g.ry);c.stroke();c.setLineDash([]);c.restore();
  }
  function drawDirection(c,g,L){
    c.save();c.textAlign='center';c.textBaseline='middle';c.font='9px Consolas,monospace';
    for(let j=0;j<4;j++){const p=point(j*L/4,L,g),scaleX=j%2?1.10:1,scaleY=j%2?1:1.26,x=g.cx+(p.x-g.cx)*scaleX,y=g.cy+(p.y-g.cy)*scaleY;c.fillStyle='#6196ad';c.fillText((j*L/4).toFixed(j%2?1:0)+' m',x,y);}
    for(let j=0;j<6;j++){const p=point((j+.45)*L/6,L,g);c.save();c.translate(p.x,p.y);c.rotate(p.heading);c.strokeStyle='#69d6e365';c.lineWidth=1;c.beginPath();c.moveTo(-3,-3);c.lineTo(1,0);c.lineTo(-3,3);c.stroke();c.restore();}c.restore();
  }
  function drawTrails(c,g,state,color){
    const now=state.sim.t,L=state.sim.params.L,hist=state.history;
    let start=hist.length-1;while(start>0&&hist[start-1].t>now-2.5)start--;
    if(start===hist.length-1&&hist.length<2)return;
    c.save();c.lineCap='round';
    for(let i=0;i<state.sim.params.N;i++){
      const records=[];for(let j=start;j<hist.length;j++){if(hist[j].t>=now-2.5)records.push({t:hist[j].t,x:hist[j].unwrapped[i],v:hist[j].v[i]});}
      records.push({t:now,x:state.sim.x[i],v:state.sim.v[i]});
      for(let j=1;j<records.length;j++){const a=records[j-1],b=records[j],age=(now-b.t)/2.5;if(age>1||Math.abs(b.x-a.x)<.002)continue;const p=point(a.x,L,g),q=point(b.x,L,g);c.globalAlpha=Math.max(0,(1-age)*.45);c.strokeStyle=color((a.v+b.v)/2);c.lineWidth=i===state.selected?4:2.2;c.beginPath();c.moveTo(p.x,p.y);
        // Interpolate actual cumulative positions on the periodic projection;
        // this keeps wrap-around trails on the road, never across the centre.
        const n=Math.max(1,Math.ceil(Math.abs(b.x-a.x)/L*160));for(let k=1;k<=n;k++){const s=point(a.x+(b.x-a.x)*k/n,L,g);c.lineTo(s.x,s.y);}c.stroke();}
    }c.restore();
  }
  function brakeAmount(state,i){let b=state.brakeVisual;if(!b&&state.sim.active)b={id:state.sim.active.id,start:state.sim.t,end:state.sim.active.end};if(!b||b.id!==i)return 0;const t=state.sim.t;if(t<b.start||t>b.end+3)return 0;const fade=t<=b.end?1:Math.max(0,1-(t-b.end)/3);return fade*(.65+.35*Math.sin((t-b.start)*8)**2);}
  function drawCar(c,g,state,i,color){
    const p=point(state.sim.x[i],state.sim.params.L,g),selected=i===state.selected,brake=brakeAmount(state,i),paint=color(state.sim.v[i]);
    c.save();c.translate(p.x,p.y);c.rotate(p.heading);
    c.fillStyle='#0008';c.beginPath();c.roundRect(-9,-4,20,10,3);c.fill();
    if(brake>0){c.globalAlpha=brake*.75;c.shadowColor='#ff6577';c.shadowBlur=14;c.strokeStyle='#ff6577';c.lineWidth=1.3;c.beginPath();c.roundRect(-14,-9,28,18,7);c.stroke();c.shadowBlur=0;c.globalAlpha=1;}
    if(selected){c.strokeStyle='#b4f8ff';c.shadowColor='#52dbe6';c.shadowBlur=8;c.lineWidth=1.1;c.beginPath();c.roundRect(-12,-7,24,14,4);c.stroke();c.shadowBlur=0;}
    c.fillStyle='#04101d';c.fillRect(-6,-6,4,2);c.fillRect(4,-6,4,2);c.fillRect(-6,4,4,2);c.fillRect(4,4,4,2);
    const grad=c.createLinearGradient(0,-4,0,4);grad.addColorStop(0,'#d6f5ff');grad.addColorStop(.18,paint);grad.addColorStop(.65,paint);grad.addColorStop(1,'#142939');c.fillStyle=grad;c.strokeStyle=paint;c.lineWidth=.8;c.beginPath();c.roundRect(-9,-4.3,18,8.6,2.8);c.fill();c.stroke();
    c.fillStyle='#082237';c.beginPath();c.roundRect(-3.2,-3.1,7,6.2,1.5);c.fill();c.fillStyle='#85d8e845';c.fillRect(2,-2.5,1.3,5);c.fillStyle='#aacbdf28';c.fillRect(-2.5,-2.6,2,5.2);
    c.fillStyle='#c7faff';c.shadowColor='#a1f4ff';c.shadowBlur=7;c.fillRect(7.6,-3.1,1.4,2);c.fillRect(7.6,1.1,1.4,2);c.shadowBlur=0;
    c.fillStyle=brake>0?'#ff4a68':'#ff6c7b';c.shadowColor='#ff4a68';c.shadowBlur=brake>0?10:2;c.fillRect(-9.2,-3.3,1.4,2);c.fillRect(-9.2,1.3,1.4,2);c.shadowBlur=0;c.restore();
    if(selected){const inner=point(state.sim.x[i],state.sim.params.L,{...g,rx:g.rx-31,ry:g.ry-27});c.save();c.fillStyle='#b1dee8';c.font='9px "Microsoft YaHei",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText((i+1)+'号',inner.x,inner.y);c.restore();}
  }
  function draw(state){if(!state.sim)return;const canvas=document.getElementById('ring'),{c,w,h}=root.TrafficViz.setup(canvas),g=geometry(w,h),color=root.TrafficViz.color;c.save();drawFloor(c,g,w,h);drawRoad(c,g);drawDirection(c,g,state.sim.params.L);drawTrails(c,g,state,color);const order=Array.from({length:state.sim.params.N},(_,i)=>i).sort((a,b)=>point(state.sim.x[a],state.sim.params.L,g).y-point(state.sim.x[b],state.sim.params.L,g).y);for(const i of order)drawCar(c,g,state,i,color);c.restore();}
  function pick(state,clientX,clientY){const canvas=document.getElementById('ring'),r=canvas.getBoundingClientRect(),g=geometry(r.width,r.height),x=clientX-r.left,y=clientY-r.top;let best=22,id=-1;for(let i=0;i<state.sim.params.N;i++){const p=point(state.sim.x[i],state.sim.params.L,g),d=Math.hypot(x-p.x,y-p.y);if(d<best){best=d;id=i;}}return id;}
  root.TrafficScene={draw,pick,geometry,point,version:'scene-v2.0'};
})(window);
