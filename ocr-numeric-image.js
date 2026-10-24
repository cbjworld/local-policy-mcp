const fs=require('node:fs'),{inflateSync}=require('node:zlib');
function grey(input){
 const b=Buffer.isBuffer(input)?input:fs.readFileSync(input);if(b.length>8500000||b.length<33||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return null;
 const width=b.readUInt32BE(16),height=b.readUInt32BE(20);if(!width||!height||width>2700||height>2700||width*height>8000000||b[24]!==8||b[25]!==0||b[28]!==0)return null;
 const parts=[];for(let i=8;i+12<=b.length;){const n=b.readUInt32BE(i);if(n>b.length-i-12)return null;if(b.toString('ascii',i+4,i+8)==='IDAT')parts.push(b.subarray(i+8,i+8+n));i+=n+12;}
 const raw=inflateSync(Buffer.concat(parts),{maxOutputLength:(width+1)*height});if(raw.length!==(width+1)*height)return null;const pixels=Buffer.alloc(width*height);
 const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
 for(let y=0;y<height;y++){const f=raw[y*(width+1)];if(f>4)return null;for(let x=0;x<width;x++){const i=y*width+x,a=x?pixels[i-1]:0,v=y?pixels[i-width]:0,c=x&&y?pixels[i-width-1]:0;pixels[i]=(raw[y*(width+1)+x+1]+[0,a,v,(a+v)>>1,paeth(a,v,c)][f])&255;}}
 return {width,height,pixels};
}
function components(image,box){
 const left=Math.max(0,Math.floor(box.left)),top=Math.max(0,Math.floor(box.top)),width=Math.max(0,Math.min(image.width-left,Math.ceil(box.width))),height=Math.max(0,Math.min(image.height-top,Math.ceil(box.height)));if(width*height>200000)return [];
 const seen=new Uint8Array(width*height),out=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const start=y*width+x;if(seen[start]||image.pixels[(top+y)*image.width+left+x]>=170)continue;seen[start]=1;const queue=[start],points=[];let minX=x,maxX=x,minY=y,maxY=y;
  for(let n=0;n<queue.length;n++){const i=queue[n],cx=i%width,cy=Math.floor(i/width);points.push([cx+left,cy+top]);minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,ny=cy+dy,j=ny*width+nx;if(nx<0||ny<0||nx>=width||ny>=height||seen[j])continue;seen[j]=1;if(image.pixels[(top+ny)*image.width+left+nx]<170)queue.push(j);}}
  out.push({x:left+minX,y:top+minY,w:maxX-minX+1,h:maxY-minY+1,points});
 }return out;
}
function triangle(c){
 if(c.h<8||c.h>45||c.w/c.h<1.1||c.w/c.h>1.8||c.points.length>c.w*c.h*.48)return false;
 const band=(lo,hi)=>c.points.filter(p=>p[1]>=c.y+c.h*lo&&p[1]<c.y+c.h*hi),upper=band(0,.2),mid=band(.25,.72),bottom=band(.88,1);
 if(!upper.length||!mid.length||!bottom.length)return false;
 const xs=a=>a.map(p=>p[0]-c.x),u=xs(upper),b=xs(bottom),m=xs(mid);
 return Math.min(...u)>c.w*.28&&Math.max(...u)<c.w*.72&&Math.min(...b)<c.w*.1&&Math.max(...b)>c.w*.9&&new Set(b).size>=c.w*.9&&m.filter(x=>x>c.w*.42&&x<c.w*.58).length<=mid.length*.1;
}
function sign(image,w){return components(image,{left:w.x-40,top:w.y-10,width:Math.min(w.w+50,250),height:w.h+20}).find(c=>triangle(c)&&c.x>=w.x-40&&c.x<w.x+w.h&&c.y+c.h>w.y&&c.y<w.y+w.h);}
function comma(image,w){return components(image,{left:w.x,top:w.y,width:w.w,height:w.h}).some(c=>c.x<w.x+w.w*.45&&c.w>=3&&c.h>=c.w*1.5&&c.h<=w.h*.35&&c.y>w.y+w.h*.55&&c.y+c.h>=w.y+w.h*.85);}
module.exports={grey,components,triangle,sign,comma};
