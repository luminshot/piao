#!/usr/bin/env python3
"""小票来了 · 最新四板块规格浏览器自检"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cdp import Chrome  # noqa: E402

URL = 'http://127.0.0.1:8911/'
FAILS = []


def ok(name, cond, extra=''):
    print(('  ✅ ' if cond else '  ❌ ') + name + (('  ' + str(extra)) if extra else ''))
    if not cond:
        FAILS.append(name)


def main():
    c = Chrome(port=9333, user_dir='/tmp/xp-prof')
    try:
        sid = c.new_page(URL)
        c.send('Emulation.setDeviceMetricsOverride', {
            'width': 390, 'height': 844, 'deviceScaleFactor': 2, 'mobile': True,
        }, session=sid)
        c.eval('localStorage.clear()')
        c.send('Page.reload', {'ignoreCache': True}, session=sid)
        time.sleep(1.3)

        tpl = json.loads(c.eval('JSON.stringify(window.__xpl.state.templates[0])'))
        roles = [s['role'] for s in tpl['sections']]
        body = tpl['sections'][1]['fields']
        amount = tpl['sections'][2]['fields']
        ok('首页比例正常', c.eval("document.getElementById('slot').style.height") == '508px')
        ok('打印按钮下方提示已移除', c.eval("document.getElementById('dock-hint')===null"))
        ok('默认标题为定金凭证', tpl['name'] == '定金凭证')
        ok('默认比例、字体与质感设定正确', c.eval("window.__xpl.state.settings.ratioId==='9:16' && window.__xpl.state.settings.font==='mono' && window.__xpl.state.settings.paper==='cool' && window.__xpl.state.settings.texture==='grain' && window.__xpl.state.settings.tear==='straight'"))
        ok('Slogan和票夹搜索提示正确', c.eval("document.querySelector('.brand-txt p').textContent==='口袋里的数字小票机' && document.getElementById('his-search').placeholder==='搜客户' && document.title.includes('口袋里的数字小票机')"))
        ok('页面拖动不会触发根页面滚动', c.eval("(()=>{const e=new WheelEvent('wheel',{deltaY:40,bubbles:true,cancelable:true});document.body.dispatchEvent(e);return e.defaultPrevented})()"))
        typography_probe = c.eval("""(()=>{const proto=CanvasRenderingContext2D.prototype;const original=proto.fillText;const result={leftX:null,right:null,prices:[]};proto.fillText=function(text,x,y){const value=String(text);const match=this.font.match(/([0-9.]+)px/);if(value==='开具时间')result.leftX=x;if(value==='示例')result.right={x,align:this.textAlign};if(value.startsWith('¥ '))result.prices.push({text:value,size:match?parseFloat(match[1]):0,y});return original.apply(this,arguments)};try{window.Receipt.render(window.__xpl.previewRec(),{width:320,dpr:1,font:'sans'})}finally{proto.fillText=original}result.prices.sort((a,b)=>a.y-b.y);result.amountGap=result.prices.length===2?result.prices[1].y-result.prices[0].y:null;return result;})()""")
        right_probe = typography_probe['right'] or {}
        margin_ok = typography_probe['leftX'] is not None and 23.5 <= typography_probe['leftX'] <= 24.5 and right_probe.get('align')=='right' and 295.5 <= right_probe.get('x', 0) <= 296.5
        ok('小票左右留白约两个汉字宽', margin_ok, typography_probe)
        prices = typography_probe['prices']
        ok('定金金额放大且行高约两行', len(prices)==2 and prices[0]['text']=='¥ 300.00' and prices[0]['size']>=17 and prices[1]['text']=='¥ 1,200.00' and prices[1]['size']<=12 and typography_probe['amountGap']>25, typography_probe)
        frame_probe = c.eval("""(()=>{const proto=CanvasRenderingContext2D.prototype;const original=proto.fillText;const result={ys:[]};proto.fillText=function(text,x,y){const value=String(text);const match=this.font.match(/([0-9.]+)px/);const size=match?parseFloat(match[1]):0;result.ys.push(y);if(value==='L'&&size>8&&size<9)result.en={size,y};if(value==='有'&&size>=14&&size<15)result.cn={size,y};if(value==='定'&&size>=25)result.title={size,y};return original.apply(this,arguments)};let rendered;try{rendered=window.Receipt.render(window.__xpl.previewRec(),{width:286,ratio:16/9,dpr:1,font:'sans',paper:'cool',texture:'grain',tear:'straight'})}finally{proto.fillText=original}result.h=rendered.h;result.scale=rendered.scale;result.topY=result.ys.length?Math.min(...result.ys):null;result.bottomGap=result.ys.length?rendered.h-Math.max(...result.ys):null;result.brandGap=result.cn&&result.en?result.cn.y-result.en.y:null;delete result.ys;return result;})()""")
        en_probe = frame_probe.get('en') or {}
        cn_probe = frame_probe.get('cn') or {}
        title_probe = frame_probe.get('title') or {}
        brand_gap = frame_probe.get('brandGap')
        ok('品牌中英文行距收紧、中文品牌名与票名缩小', en_probe.get('size')==8.6 and cn_probe.get('size')==14 and title_probe.get('size')==26 and brand_gap is not None and brand_gap<18, frame_probe)
        top_y = frame_probe.get('topY')
        bottom_gap = frame_probe.get('bottomGap')
        ok('票面上下均预留约24px', top_y is not None and top_y>=28 and bottom_gap is not None and bottom_gap>=28, frame_probe)
        ok('默认模板固定四板块', roles == ['top', 'body', 'amount', 'bottom'], roles)
        ok('网页不再加载未使用的旧配置', c.eval("!Array.from(document.scripts).some(s=>s.src.includes('config.js'))"))
        ok('正文项目和顺序正确', [f['label'] for f in body] == [
            '开具时间', '客户', '拍摄日期', '拍摄时段', '拍摄城市', '拍摄地点', '拍摄内容', '拍摄档位'])
        ok('开具时间自动、拍摄日期手填', body[0]['type'] == 'time' and body[2]['type'] == 'date')
        ok('时段选项正确', body[3]['options'] == ['午宴', '晚宴'])
        ok('城市选项正确', body[4]['options'] == ['深圳', '广州'])
        ok('拍摄内容选项正确', body[6]['options'] == ['周岁', '求婚'])
        ok('金额字段顺序正确且仅定金特别处理', [f['label'] for f in amount] == ['定金', '剩余尾款', '收款方式'] and amount[0].get('emphasis') == 'primary' and amount[1].get('emphasis') != 'primary' and amount[2]['options'] == ['微信', '支付宝'])
        legacy_logo = json.loads(c.eval("JSON.stringify((()=>{const logo='data:image/png;base64,legacy';const t=window.TPL.normalizeTpl({id:'legacy-logo',schemaVersion:5,name:'旧模板',brand:{en:'OLD',cn:'旧',img:logo},sections:[{id:'sec-top',role:'top',fields:[]},{id:'sec-body',role:'body',fields:[]},{id:'sec-amount',role:'amount',fields:[]},{id:'sec-bottom',role:'bottom',fields:[]}],footer:{}});const r=window.Receipt.render({template:t,values:{}},{width:220,dpr:1});return {kept:t.brand.img===logo,hasImageApi:typeof window.TPL.getImage==='function'||typeof window.TPL.shrinkImage==='function',height:r.h};})())"))
        ok('旧模板图片数据保留但不再有图片处理接口', legacy_logo['kept'] and not legacy_logo['hasImageApi'] and legacy_logo['height'] > 0, legacy_logo)
        ok('Android返回键网页接口已暴露', c.eval("typeof window.__xpl.handleBack==='function'"))
        ok('打印中按返回键不会意外退出', c.eval("(()=>{const s=window.__xpl.state;const mode=s.mode;s.mode='printing';const handled=window.__xpl.handleBack();s.mode=mode;return handled})()"))
        ok('底部文案保留且 Slogan 升级为双行', tpl['footer'] == {
            'line1': '收到定金，已预留拍摄档期',
            'line2': '服务明细以价格单为准，请确认已仔细阅读',
            'slogan1': '',
            'slogan2': '时光会走远，影像能长存'
        })
        demo = json.loads(c.eval('JSON.stringify(window.__xpl.previewRec())'))
        ok('演示开具时间固定', demo['timeText'] == '2026-11-17 09:00')
        ok('演示样张保留原 Slogan 画面', demo['template']['footer'].get('slogan1') == '' and demo['template']['footer'].get('slogan2') == '时光会走远，影像能长存')
        ok('演示正文使用指定内容', [demo['values'].get(k) for k in ['f-customer','f-shootdate','f-shoottime','f-city','f-place','f-content','f-tier']] == ['示例','2026-12-18','上午','深圳','有光入画摄影棚','周岁','标准档'])
        ok('演示定金、尾款和支付方式固定', demo['values'].get('f-money') == '300' and demo['values'].get('f-balance') == '1200' and demo['values'].get('f-pay') == '支付宝')
        native_export = c.eval("(async()=>{const old=window.AndroidApp;let resolve;const saved=new Promise(r=>resolve=r);window.AndroidApp={saveFile(name,mime,data){resolve({name,mime,length:data.length})}};try{window.__xpl.exportImage(window.__xpl.previewRec(),'download');return await Promise.race([saved,new Promise(r=>setTimeout(()=>r(null),5000))])}finally{if(old)window.AndroidApp=old;else delete window.AndroidApp}})()")
        ok('Android导出桥收到PNG数据', isinstance(native_export, dict) and native_export.get('mime') == 'image/png' and native_export.get('name', '').endswith('.png') and native_export.get('length', 0) > 1000, native_export)

        c.eval("window.__xpl.state.templates[0].brand.img='data:image/png;base64,legacy'")
        c.eval("window.__xpl.state.templates[0].brand.img='data:image/png;base64,legacy'")
        c.eval("document.getElementById('btn-print').click()")
        time.sleep(0.5)
        labels = json.loads(c.eval("JSON.stringify(Array.from(document.querySelectorAll('#form-fields .f-label')).map(x=>x.textContent.trim()))"))
        ok('开单表单显示所有手填字段', labels == [
            '开具时间', '客户', '拍摄日期', '拍摄时段', '拍摄城市', '拍摄地点',
            '拍摄内容', '拍摄档位', '定金', '剩余尾款', '收款方式'
        ], labels)
        time_value = c.eval("document.querySelector('#form-fields input[readonly]').value")
        ok('开具时间格式 YYYY-MM-DD HH:MM', len(time_value) == 16 and time_value[4] == '-' and time_value[7] == '-' and time_value[10] == ' ' and time_value[13] == ':', time_value)
        blank = json.loads(c.eval("JSON.stringify({customer:document.querySelector('#form-fields .field:nth-of-type(2) input')?.value,date:document.querySelector('#form-fields input[placeholder=\"YYYY-MM-DD\"]').value,deposit:Array.from(document.querySelectorAll('#form-fields .field')).find(x=>x.querySelector('.f-label')?.textContent.trim()==='定金').querySelector('input').value,balance:Array.from(document.querySelectorAll('#form-fields .field')).find(x=>x.querySelector('.f-label')?.textContent.trim()==='剩余尾款').querySelector('input').value})"))
        ok('日期保留系统日历且提示为 YYYY-MM-DD', c.eval("document.querySelector('#form-fields input[type=date][placeholder=\"YYYY-MM-DD\"]')!==null && document.querySelector('#form-fields .date-input-placeholder').textContent==='YYYY-MM-DD'"))
        ok('客户、日期、定金、尾款默认留空', blank == {'customer': '', 'date': '', 'deposit': '', 'balance': ''}, blank)
        ok('模板编辑说明已移除', c.eval("document.querySelector('#form-fields .tpl-help')===null"))

        c.eval("""(()=>{
          const row=(label)=>Array.from(document.querySelectorAll('#form-fields .field')).find(x=>x.querySelector('.f-label')?.textContent.trim()===label);
          const set=(label,value,event='input')=>{const i=row(label).querySelector('input');i.value=value;i.dispatchEvent(new Event(event,{bubbles:true}));};
          set('客户','测试客户'); set('拍摄日期','2026-12-24','change'); set('定金','1200'); set('剩余尾款','500');
          ['拍摄时段','拍摄城市','拍摄内容','收款方式'].forEach(label=>row(label).querySelector('.chip').click());
          document.getElementById('btn-do-print').click();
        })()""")
        time.sleep(4.4)
        issued = json.loads(c.eval('JSON.stringify(window.__xpl.state.data.values)'))
        ok('真实开单时间已自动写入', isinstance(issued.get('f-issuedAt'), str) and len(issued['f-issuedAt']) == 16)
        ok('拍摄日期保持 YYYY-MM-DD', issued.get('f-shootdate') == '2026-12-24', issued.get('f-shootdate'))
        ok('剩余尾款写入小票数据', issued.get('f-balance') == '500', issued.get('f-balance'))
        ok('实际开单不带演示标记', c.eval('window.__xpl.state.data.demo===false'))
        ok('旧图片保留在模板但不复制进新历史', c.eval("window.__xpl.state.templates[0].brand.img==='data:image/png;base64,legacy'&&window.__xpl.state.history[0].rec.template.brand.img===null"))

        c.eval("document.getElementById('btn-tear').click()")
        time.sleep(1.8)
        c.eval("document.getElementById('btn-print').click()")
        time.sleep(0.3)
        c.eval("document.getElementById('close-new').click()")
        time.sleep(0.4)
        c.eval("document.querySelector('.tpl-card .tpl-pen').click()")
        time.sleep(0.4)
        headings = json.loads(c.eval("JSON.stringify(Array.from(document.querySelectorAll('#editor-body .set-group h3')).map(x=>x.textContent))"))
        ok('默认模板可编辑且分四板块', headings == ['顶部', '正文', '金额', '底部'], headings)
        ok('顶部编辑器仅保留中英文名称', c.eval("(()=>{const top=Array.from(document.querySelectorAll('#editor-body .set-group')).find(g=>g.querySelector('h3')?.textContent.trim()==='顶部');const labels=Array.from(top.querySelectorAll('.f-label')).map(x=>x.textContent.trim());return labels.includes('英文（小字）')&&labels.includes('中文（大字）')&&!top.querySelector('input[type=file]')&&!/logo/i.test(top.textContent);})()"))
        ok('默认模板编辑器提供双行 Slogan', c.eval("(()=>{const a=Array.from(document.querySelectorAll('#editor-body .f-label')).map(x=>x.textContent.trim());return a.includes('Slogan第一行')&&a.includes('Slogan第二行')})()"))
        ok('默认模板也可删除', c.eval("Array.from(document.querySelectorAll('#editor-body button')).some(b=>b.textContent==='删除这个模板')"))
        c.eval("document.getElementById('editor-cancel').click()")
        time.sleep(0.4)

        c.eval("document.querySelector('.tpl-card.tpl-add').click()")
        time.sleep(0.4)
        headings = json.loads(c.eval("JSON.stringify(Array.from(document.querySelectorAll('#editor-body .set-group h3')).map(x=>x.textContent))"))
        ok('新模板编辑页分四板块', headings == ['顶部', '正文', '金额', '底部'], headings)
        c.eval("document.getElementById('editor-save').click()")
        time.sleep(0.5)
        saved = json.loads(c.eval('JSON.stringify(window.__xpl.state.templates)'))
        new_tpl = next(t for t in saved if t['id'] != 't-default')
        ok('新模板预置完整字段和文案', [f['label'] for f in new_tpl['sections'][1]['fields']] == [f['label'] for f in tpl['sections'][1]['fields']])
        ok('新模板预置双行 Slogan', new_tpl['footer'].get('slogan1') == '' and new_tpl['footer'].get('slogan2') == '时光会走远，影像能长存')
        new_ids = [f['id'] for s in new_tpl['sections'] for f in s['fields']]
        old_ids = [f['id'] for s in tpl['sections'] for f in s['fields']]
        ok('新模板字段编号独立', not set(new_ids).intersection(old_ids))
        ok('新模板保存并可删除', c.eval('window.__xpl.state.templates.length') == 2)

        c.eval('window.confirm=()=>true')
        c.eval("Array.from(document.querySelectorAll('.tpl-card')).find(b=>b.textContent.includes('定金凭证')).querySelector('.tpl-pen').click()")
        time.sleep(0.4)
        c.eval("Array.from(document.querySelectorAll('#editor-body button')).find(b=>b.textContent==='删除这个模板').click()")
        time.sleep(0.4)
        ok('删除默认后保留其他模板', c.eval('window.__xpl.state.templates.length') == 1)
        c.eval("document.querySelector('.tpl-card .tpl-pen').click()")
        time.sleep(0.4)
        c.eval("Array.from(document.querySelectorAll('#editor-body button')).find(b=>b.textContent==='删除这个模板').click()")
        time.sleep(0.4)
        ok('删除最后一张不自动重建', c.eval('window.__xpl.state.templates.length') == 0)
        c.eval("document.getElementById('btn-print').click()")
        time.sleep(0.4)
        ok('最后一张删除后提示新建', c.eval("document.querySelector('#form-fields').textContent.includes('还没有模板')"))

        old = {
            'id': 't-default', 'schemaVersion': 3, 'name': '定金凭证',
            'brand': {'type': 'text', 'en': 'OLD-EN', 'cn': '旧品牌', 'img': None},
            'sections': [
                {'role': 'top', 'fields': []},
                {'role': 'body', 'fields': [{'id': 'f-customer', 'type': 'text', 'label': '客户'}]},
                {'role': 'amount', 'fields': [{'id': 'f-money', 'type': 'money', 'label': '定金：人民币'}]},
                {'role': 'bottom', 'fields': []}
            ],
            'footer': {'intro': '说明：', 'line1': '收到定金，已预留拍摄档期', 'line2': '服务明细以价格单为准，请确认已仔细阅读', 'slogan': '时光会走远，影像能长存'}
        }
        raw = json.dumps(json.dumps([old], ensure_ascii=False), ensure_ascii=False)
        c.eval("localStorage.setItem('xpl_templates_v1'," + raw + ')')
        c.eval("localStorage.setItem('xpl_settings_v1', JSON.stringify({font:'sans',visualPreset:2,ratioId:'1:1',ratio:1,paper:'blue'}))")
        c.send('Page.reload', {'ignoreCache': True}, session=sid)
        time.sleep(1.2)
        migrated = json.loads(c.eval('JSON.stringify(window.__xpl.state.templates[0])'))
        ok('旧版默认模板升级并保留品牌', migrated['schemaVersion'] == 6 and migrated['brand']['en'] == 'OLD-EN')
        ok('旧模板原 Slogan 迁入第二行', migrated['footer'].get('slogan1') == '' and migrated['footer'].get('slogan2') == '时光会走远，影像能长存' and 'slogan' not in migrated['footer'])
        ok('迁移后补齐自动开具时间', any(f['id'] == 'f-issuedAt' and f['type'] == 'time' for f in migrated['sections'][1]['fields']))
        migrated_amount = migrated['sections'][2]['fields']
        ok('旧定金标签更新并补入尾款字段', [f['label'] for f in migrated_amount] == ['定金', '剩余尾款', '收款方式'], [f['label'] for f in migrated_amount])
        ok('旧默认字体迁移为等宽', c.eval("window.__xpl.state.settings.font==='mono' && window.__xpl.state.settings.visualPreset===3"))
        ok('旧浅蓝设置自动迁移为浅灰', c.eval("window.__xpl.state.settings.paper==='cool'"))
        ok('旧1:1设置迁移为9:16', c.eval("window.__xpl.state.settings.ratioId==='9:16' && window.__xpl.state.settings.ratio===16/9"))
        ok('旧模板说明标签不再保留', 'intro' not in migrated['footer'])
        c.eval("document.getElementById('btn-settings').click()")
        time.sleep(0.35)
        settings_text = c.eval("document.getElementById('settings-body').innerText")
        ok('版权与网页版版本号显示正确', c.eval("document.getElementById('dock-about').textContent.trim()==='小票来了｜v1.0.3｜© 康康Ken'") and '© 康康Ken' not in settings_text)
        ok('主页Logo和App图标共用矢量源', c.eval("document.querySelector('.mark img')?.getAttribute('src')==='assets/logo-mark.svg'"))
        ok('设置分组与字段完整', all(x in settings_text for x in ['样式','纸张宽度','画幅比例','排版','字号','内容密度','分隔线','细实线','细虚线','点线','质感','纸张纹理','撕纸边缘','平切','锯齿','效果','打印音效','音量','数据','关于','当前版本','检查更新']))
        setting_groups = json.loads(c.eval("JSON.stringify(Array.from(document.querySelectorAll('#settings-body .set-group h3')).map(x=>x.textContent))"))
        ok('关于紧跟数据分组', setting_groups == ['样式','排版','质感','效果','数据','关于'], setting_groups)
        panel_scroll_allowed = c.eval("(()=>{const a=document.querySelector('.page-body');const e=new WheelEvent('wheel',{deltaY:40,bubbles:true,cancelable:true});a.dispatchEvent(e);return !e.defaultPrevented})()")
        ok('设置面板仍可独立滚动', panel_scroll_allowed)
        update_probe = c.eval("""(async()=>{const b=document.getElementById('btn-check-updates');const f=window.fetch;let requested='';window.confirm=()=>false;window.fetch=async(url)=>{requested=String(url);return {ok:true,status:200,json:async()=>({tag_name:'v1.0.4',html_url:'https://github.com/luminshot/piao/releases/tag/v1.0.4'})}};b.click();window.fetch=f;await new Promise(r=>setTimeout(r,30));return {status:document.getElementById('update-status').textContent,button:b.textContent,disabled:b.disabled,requested};})()""")
        ok('更新检查指向自己的 GitHub Release API', update_probe['requested']=='https://api.github.com/repos/luminshot/piao/releases/latest', update_probe)
        ok('发现新版本时显示版本号且不自动跳转', update_probe['status']=='发现新版本 v1.0.4。' and update_probe['button']=='检查更新' and update_probe['disabled'] is False, update_probe)
        missing_probe = c.eval("""(async()=>{const b=document.getElementById('btn-check-updates');const f=window.fetch;window.fetch=async()=>({ok:false,status:404});b.click();window.fetch=f;await new Promise(r=>setTimeout(r,30));return document.getElementById('update-status').textContent;})()""")
        ok('更新仓库尚未发布时给出清晰提示', missing_probe == '暂时找不到更新信息，发布页可能尚未上线。', missing_probe)
        ratio_labels = json.loads(c.eval("JSON.stringify(Array.from(Array.from(document.querySelectorAll('#settings-body .set-row')).find(r=>r.querySelector('.lab')?.textContent.trim()==='画幅比例').querySelectorAll('.seg button')).map(b=>b.textContent))"))
        ok('比例选项去除1:1且默认9:16', ratio_labels == ['3:4','9:16','自动','自定义'] and c.eval("window.__xpl.state.settings.ratioId==='9:16'"), ratio_labels)
        ok('默认分隔线为细实线', c.eval("window.__xpl.state.settings.dividerStyle==='solid' && Array.from(document.querySelectorAll('#settings-body .set-row')).find(r=>r.querySelector('.lab')?.textContent.trim()==='分隔线').querySelector('.seg .on').textContent==='细实线'"))
        paper_labels = json.loads(c.eval("JSON.stringify(Array.from(document.querySelectorAll('#settings-body .swatches button')).map(b=>b.getAttribute('aria-label')))"))
        ok('去除浅蓝后保留四种纸色', paper_labels == ['纯白','暖白','浅灰','浅黄'], paper_labels)
        tear_labels = json.loads(c.eval("JSON.stringify(Array.from(Array.from(document.querySelectorAll('#settings-body .set-row')).find(r=>r.querySelector('.lab')?.textContent.trim()==='撕纸边缘').querySelectorAll('.seg button')).map(b=>b.textContent))"))
        ok('撕纸边缘仅保留平切和锯齿', tear_labels == ['平切','锯齿'], tear_labels)
        color_labels_visible = c.eval("document.querySelectorAll('#settings-body .sw-label').length===0")
        ok('色块下方不显示文字提示且保留无障碍名称', color_labels_visible and paper_labels == ['纯白','暖白','浅灰','浅黄'], paper_labels)
        migrated_custom = json.loads(c.eval("JSON.stringify((()=>{const t=window.TPL.normalizeTpl({id:'custom-old',schemaVersion:4,name:'旧自建模板',brand:{},sections:[{id:'sec-top',role:'top',fields:[]},{id:'sec-body',role:'body',fields:[]},{id:'sec-amount',role:'amount',fields:[{id:'dep-old',type:'money',label:'定金：人民币'},{id:'pay-old',type:'payment',label:'收款方式',options:['微信']}]},{id:'sec-bottom',role:'bottom',fields:[]}],footer:{}});return t.sections[2].fields;})())"))
        ok('旧自建模板也更新定金并加入可选尾款', [f['label'] for f in migrated_custom] == ['定金','剩余尾款','收款方式'] and migrated_custom[1].get('optional') is True, migrated_custom)
        c.eval("(()=>{const row=l=>Array.from(document.querySelectorAll('#settings-body .set-row')).find(r=>r.querySelector('.lab')?.textContent.trim()===l);const choose=(l,t)=>{const r=row(l);if(l==='纸张颜色')r.querySelector('[aria-label=\"'+t+'\"]').click();else Array.from(r.querySelectorAll('.seg button')).find(b=>b.textContent===t).click();};choose('字号','大');choose('内容密度','紧凑');choose('分隔线','点线');choose('纸张颜色','浅灰');choose('撕纸边缘','平切');})()")
        applied = json.loads(c.eval("JSON.stringify({fontSize:window.__xpl.state.settings.fontSize,density:window.__xpl.state.settings.density,dividerStyle:window.__xpl.state.settings.dividerStyle,paper:window.__xpl.state.settings.paper,tear:window.__xpl.state.settings.tear})"))
        ok('字号密度分隔线纸色和撕边均可应用', applied == {'fontSize':'large','density':'compact','dividerStyle':'dotted','paper':'cool','tear':'straight'}, applied)
        printer_probe = c.eval("(async()=>{const original=window.Receipt.render;let passed=null,started=false,ended=false;window.Sound.setMuted(true);window.Receipt.render=(rec,opts)=>{passed=opts;return original(rec,opts)};try{await window.Printer.print(window.__xpl.previewRec(),{duration:16,width:180,ratio:0,font:'mono',fontSize:'large',density:'loose',dividerStyle:'dotted',paper:'cool',texture:'grain',tear:'straight',onStart(){started=true},onEnd(){ended=true}})}finally{window.Receipt.render=original;window.Printer.reset();const s=window.__xpl.state.settings;window.Printer.show(window.__xpl.previewRec(),{width:286,ratio:16/9,dpr:2,font:s.font,fontSize:s.fontSize,density:s.density,dividerStyle:s.dividerStyle,paper:s.paper,texture:s.texture,tear:s.tear})}return {passed,started,ended}})()")
        forwarded = printer_probe['passed'] or {}
        ok('打印渲染收到排版设置', all(forwarded.get(k)==v for k,v in {'fontSize':'large','density':'loose','dividerStyle':'dotted','paper':'cool','tear':'straight'}.items()), forwarded)
        ok('打印开始与结束回调正常触发', printer_probe['started'] and printer_probe['ended'], printer_probe)
        ok('浏览器控制台无报错', not c.console_errors(), c.console_errors()[:2])

        print('\n失败项：', FAILS if FAILS else '无')
        if FAILS:
            sys.exit(1)
    finally:
        c.close()


if __name__ == '__main__':
    main()
