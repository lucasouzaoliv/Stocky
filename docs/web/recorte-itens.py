import cv2, numpy as np, os, sys
from PIL import Image
OUT='/home/claude/lucasouzaoliv/stocky/web/public/itens'
SC=6  # ampliação para máscara suave
# (fonte, caixa do ícone) -- caixa justa em volta do item, em px do print
M={
 'gaze':('s4',(276,192,324,236)),
 'adrenalina':('s4',(389,184,439,236)),
 'usp':('s2',(80,96,120,152)),
 'desert':('s6',(56,40,106,94)),
 'colete':('s1',(52,106,98,152)),
 'muni_9mm':('s5',(283,114,326,152)),
 'muni_45acp':('s5',(396,110,446,150)),
 'muni_50ae':('s5',(514,100,572,154)),
 'pecas_roupas':('s3',(422,74,470,102)),
 'plastico':('s1',(392,590,448,632)),
 'sucata_metal':('s3',(58,304,118,358)),
 'meta':('s5',(166,114,208,158)),
 'agulha':('s2',(318,346,368,400)),
 'linha':('s2',(198,346,254,400)),
 'resina':('s2',(430,582,478,638)),
 'tesoura':('s2',(314,222,372,282)),
 'notas_marcadas':('s1',(516,346,570,390)),
 'chaves_de_casa':('s1',(398,222,444,264)),
 'bateria_de_impressora':('s1',(164,584,206,622)),
 'skateboard':('s1',(284,596,316,618)),
 'insumo_para_fabricacao_de_drogas':('s1',(510,590,576,642)),
 'knife':('s2',(202,108,246,150)),
 'tablet':('s2',(438,116,480,154)),
 'radio':('s2',(552,112,586,162)),
 'chave_de_carro':('s2',(76,226,126,272)),
 'doe_mendigo':('s2',(430,222,484,286)),
 'placa_falsa':('s2',(546,238,594,270)),
 'caixa_de_ferramentas':('s2',(76,348,126,398)),
 'pneu':('s2',(432,348,486,400)),
 'chave_de_roda':('s2',(68,470,132,528)),
 'dinheiro':('s2',(200,476,248,510)),
 'polaroid':('s2',(70,596,128,650)),
 'caixa_de_comida':('s2',(316,586,370,642)),
 'esponjinha':('s2',(546,586,596,628)),
 'serra_eletrica':('s3',(60,186,118,232)),
 'pistola_pneumatica':('s3',(188,184,238,236)),
 'chave_de_fenda':('s3',(300,184,360,240)),
 'lista_de_modificacoes':('s3',(422,190,470,234)),
 'lockpick':('s3',(306,428,356,478)),
 'identidade':('s3',(420,548,470,586)),
 'celular':('s3',(538,543,576,586)),
 'analgesico':('s4',(162,190,210,246)),
 'trojan_bancario':('s4',(162,312,210,356)),
 'usb_trojan':('s4',(162,428,210,474)),
 'arquivo_ghost':('s5',(46,98,104,176)),
 'cz_scorpion_evo':('s5',(56,236,96,274)),
 'assault_rifle_mk2':('s7',(596,144,651,176)),
 'bateria':('s8',(616,146,658,184)),
 'material_reciclavel':('s8',(616,396,660,435)),
}

only=sys.argv[1:]
REFINA={'assault_rifle_mk2':20,'chave_de_fenda':34,'lockpick':34,'trojan_bancario':34,'skateboard':40,'adrenalina':34,'agulha':30,'tesoura':34,'linha':30}
S=160  # lado final
for k,(s,(x0,y0,x1,y1)) in M.items():
    if only and k not in only: continue
    im=cv2.imread(s+'.png')
    pad=8
    X0,Y0,X1,Y1=max(0,x0-pad),max(0,y0-pad),min(im.shape[1],x1+pad),min(im.shape[0],y1+pad)
    crop=im[Y0:Y1,X0:X1]
    big=cv2.resize(crop,None,fx=SC,fy=SC,interpolation=cv2.INTER_CUBIC)
    h,w=big.shape[:2]
    m=np.full((h,w),cv2.GC_BGD,np.uint8)
    # região provável de item: caixa; centro: provável item certo
    ix0,iy0,ix1,iy1=[(a-b)*SC for a,b in ((x0,X0),(y0,Y0),(x1,X0),(y1,Y0))]
    m[iy0:iy1,ix0:ix1]=cv2.GC_PR_FGD
    cx0=int(ix0+(ix1-ix0)*0.3);cx1=int(ix1-(ix1-ix0)*0.3);cy0=int(iy0+(iy1-iy0)*0.3);cy1=int(iy1-(iy1-iy0)*0.3)
    m[cy0:cy1,cx0:cx1]=cv2.GC_FGD
    bgd=np.zeros((1,65));fgd=np.zeros((1,65))
    cv2.grabCut(big,m,None,bgd,fgd,6,cv2.GC_INIT_WITH_MASK)
    mask=np.where((m==cv2.GC_FGD)|(m==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    if k in REFINA:
        ring=np.concatenate([big[:3*SC].reshape(-1,3),big[-3*SC:].reshape(-1,3),big[:,:3*SC].reshape(-1,3),big[:,-3*SC:].reshape(-1,3)])
        bgc=np.median(ring,axis=0)
        dist=np.linalg.norm(big.astype(np.float32)-bgc.astype(np.float32),axis=2)
        dist=cv2.GaussianBlur(dist,(0,0),SC*0.4)
        mask=np.where((mask>0)&(dist>REFINA[k]),255,0).astype(np.uint8)
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((SC*2,SC*2),np.uint8))
        n,lab,st,_=cv2.connectedComponentsWithStats(mask)
        tot=sum(st[1:,cv2.CC_STAT_AREA]) if n>1 else 1
        out_=np.zeros_like(mask)
        for i in range(1,n):
            if st[i,cv2.CC_STAT_AREA]>0.04*tot: out_[lab==i]=255
        mask=out_
    else:
        n,lab,st,_=cv2.connectedComponentsWithStats(mask)
        if n>1:
            keep=1+np.argmax(st[1:,cv2.CC_STAT_AREA]); mask=np.where(lab==keep,255,0).astype(np.uint8)
        cnts,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        filled=np.zeros_like(mask); cv2.drawContours(filled,cnts,-1,255,-1)
        mask=filled
    mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((SC,SC),np.uint8))
    mask=cv2.GaussianBlur(mask,(0,0),SC*0.7); mask=(mask>127).astype(np.uint8)*255
    # recorta ao bbox da máscara e centra em quadrado S
    ys,xs=np.where(mask>0)
    if len(xs)==0: print('vazio',k); continue
    bx0,bx1,by0,by1=xs.min(),xs.max(),ys.min(),ys.max()
    item=big[by0:by1+1,bx0:bx1+1]; im_m=mask[by0:by1+1,bx0:bx1+1]
    contorno=int(0.045*S*SC/ (S/ max(item.shape[:2])*SC/SC) ) if False else 0
    ih,iw=item.shape[:2]
    alvo=S*0.74   # espaço do item dentro do quadrado (sobra para o contorno)
    f=alvo/max(ih,iw)
    item=cv2.resize(item,None,fx=f,fy=f,interpolation=cv2.INTER_AREA)
    im_m=cv2.resize(im_m,None,fx=f,fy=f,interpolation=cv2.INTER_AREA)
    # canvas com supersampling 4x para contorno liso
    Q=4
    cv=np.zeros((S*Q,S*Q,4),np.uint8)
    ih2,iw2=item.shape[:2]
    itemQ=cv2.resize(item,(iw2*Q,ih2*Q),interpolation=cv2.INTER_CUBIC)
    maskQ=cv2.resize(im_m,(iw2*Q,ih2*Q),interpolation=cv2.INTER_CUBIC)
    maskQ=(maskQ>127).astype(np.uint8)*255
    ox=(S*Q-iw2*Q)//2; oy=(S*Q-ih2*Q)//2
    full=np.zeros((S*Q,S*Q),np.uint8); full[oy:oy+ih2*Q,ox:ox+iw2*Q]=maskQ
    rgb=np.zeros((S*Q,S*Q,3),np.uint8); rgb[oy:oy+ih2*Q,ox:ox+iw2*Q]=itemQ
    esp=int(0.05*S*Q)  # espessura do contorno branco
    k_=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*esp+1,2*esp+1))
    outline=cv2.dilate(full,k_)
    outline=cv2.GaussianBlur(outline,(0,0),Q*0.6)
    # sombra suave
    sh=cv2.GaussianBlur(cv2.dilate(full,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*esp+1,2*esp+1))),(0,0),Q*3)
    sh=np.roll(sh,Q*2,axis=0)
    out=np.zeros((S*Q,S*Q,4),np.float32)
    a_sh=(sh/255.0)*0.45
    out[...,:3]=0; out[...,3]=a_sh
    # branco do contorno
    a_o=outline/255.0
    for c in range(3): out[...,c]=out[...,c]*(1-a_o)+255*a_o
    out[...,3]=a_sh*(1-a_o)+a_o
    # item por cima
    a_i=cv2.GaussianBlur(full,(0,0),Q*0.5)/255.0
    for i,c in enumerate((2,1,0)):  # BGR->RGB
        out[...,i]=out[...,i]*(1-a_i)+rgb[...,c]*a_i
    out[...,3]=out[...,3]*(1-a_i)+a_i
    out[...,3]*=255
    out8=np.clip(out,0,255).astype(np.uint8)
    img=Image.fromarray(out8,'RGBA').resize((S,S),Image.LANCZOS)
    img.save(f'{OUT}/{k}.webp','WEBP',quality=90,method=6)
    img.save(f'cut_{k}.png')
print('ok')
