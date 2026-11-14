"""Run from the project folder with Python Playwright installed."""
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = "mo_mang_data_v1"
ANSWER = "Đây là phần giải thích của mình, kèm một ví dụ và một giới hạn."
RESPONSE = {"score":5,"feedback":"<strong>Gợi ý</strong>","improvements":["Đã thêm ví dụ."],
    "recurringMistakes":[],"missingConcepts":["Nêu một giới hạn."],"followUpQuestion":"Ví dụ này có giới hạn gì?"}


class QuietServer(SimpleHTTPRequestHandler):
    test_update = False

    def do_GET(self):
        if self.test_update and self.path.split("?")[0]=="/mo-mang-app/sw.js":
            source=(ROOT/"sw.js").read_bytes().replace(b"'3.1.0'",b"'3.1.1-test'")
            self.send_response(200)
            self.send_header("Content-Type","application/javascript")
            self.end_headers()
            self.wfile.write(source)
            return
        super().do_GET()

    def translate_path(self, path):
        if path.startswith("/mo-mang-app/"):
            path = f"/{ROOT.name}/" + path.removeprefix("/mo-mang-app/")
        return super().translate_path(path)

    def log_message(self, *_):
        pass


def state(page):
    return page.evaluate("""async () => {
        const db=await new Promise((resolve,reject)=>{
            const open=indexedDB.open('mo-mang-v3');
            open.onsuccess=()=>resolve(open.result);open.onerror=reject;
        });
        const tx=db.transaction(['settings','progress','attempts','learningPlans','topics','drafts']);
        const read=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=reject;});
        const map=async name=>{
            const store=tx.objectStore(name);
            const [keys,values]=await Promise.all([read(store.getAllKeys()),read(store.getAll())]);
            return Object.fromEntries(keys.map((id,i)=>[id,values[i]]));
        };
        const [meta,progress,attempts,learningPlan,customTopics,drafts]=await Promise.all([
            read(tx.objectStore('settings').get('app')),map('progress'),
            read(tx.objectStore('attempts').getAll()),read(tx.objectStore('learningPlans').get('active')),
            read(tx.objectStore('topics').getAll()),map('drafts'),
        ]);
        db.close();
        return {...meta,progress,attempts,learningPlan,customTopics,drafts};
    }""")


def nav(page, name):
    page.locator(f'button[data-nav="{name}"]:visible').first.click()


def enter_v3(page):
    link=page.get_by_role("button",name="Mở bài theo cách V3")
    expect(link.or_(page.locator("#answer-input:visible"))).to_be_visible()
    if link.is_visible():
        link.click()


def finish(page):
    page.locator("#self-grade").click()
    page.get_by_role("radio", name="4/5: Khá rõ").click()
    page.locator("#save-assessment").evaluate("(button) => {button.click(); button.click()}")
    expect(page.locator("#completion-pane")).to_be_visible()


def layout(browser, url, width, height):
    mobile = width < 500
    context = browser.new_context(viewport={"width":width,"height":height}, is_mobile=mobile, has_touch=mobile)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    expect(page.locator("#plan-day")).to_contain_text("1/28")
    assert page.evaluate("""async () => {
        const faces=await document.fonts.load('600 16px "Noto Sans"', 'ấ ệ đ ư ỡ');
        return faces.length>0 && document.fonts.check('600 16px "Noto Sans"', 'ấ ệ đ ư ỡ')
            && getComputedStyle(document.body).fontFamily.includes('Noto Sans');
    }""")
    for name in ("track", "explore", "progress", "settings", "home"):
        nav(page,name)
        dimensions=page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})")
        assert dimensions["width"] == dimensions["scroll"], (width,name,dimensions)
    small = page.locator("button:visible").evaluate_all("buttons => buttons.filter(b=>b.offsetHeight<44||b.offsetWidth<44).map(b=>b.id||b.textContent)")
    assert not small, small
    page.locator("#hero-start").click()
    enter_v3(page)
    page.locator("#answer-input").focus()
    if mobile:
        page.set_viewport_size({"width":width,"height":310})
        page.wait_for_function("""() => {
            const box=document.querySelector('#answer-input').getBoundingClientRect();
            const submit=document.querySelector('#self-grade').getBoundingClientRect();
            return box.top>=visualViewport.offsetTop-1 && submit.bottom<=visualViewport.offsetTop+visualViewport.height+1;
        }""",timeout=5000)
        expect(page.locator(".bottom-nav")).to_be_hidden()
    assert not errors,errors
    print(f"PASS {browser.browser_type.name} layout {width}x{height}",flush=True)
    context.close()


def workflow(browser,url):
    context=browser.new_context(accept_downloads=True)
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto(url)
    expect(page.locator("#plan-day")).to_contain_text("1/28")
    page.wait_for_function("() => Boolean(navigator.serviceWorker.controller)")
    screenshot_dir=os.getenv("MO_MANG_SCREENSHOTS")
    if screenshot_dir:
        out=Path(screenshot_dir)
        out.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=out/"mo-mang-v3-hom-nay.png",full_page=True,animations="disabled")
        nav(page,"track")
        page.screenshot(path=out/"mo-mang-v3-chuyen-de.png",full_page=True,animations="disabled")
        nav(page,"home")
    due_before=page.locator("#home-due").inner_text()
    page.get_by_role("button",name="Đổi câu hỏi").click()
    expect(page.locator("#daily-card h3")).not_to_contain_text("hai bán cầu")
    topic=page.locator("#daily-card h3").inner_text()
    page.reload()
    expect(page.locator("#daily-card h3")).to_have_text(topic)
    expect(page.locator("#home-due")).to_have_text(due_before)
    page.get_by_role("button",name="Tôi muốn giải thích").click()
    enter_v3(page)
    page.locator("#show-reference").click()
    expect(page.locator("#save-assessment")).to_be_hidden()
    assert not state(page)["progress"]
    page.locator("#retry-answer").click()
    page.locator("#answer-input").fill(ANSWER)
    finish(page)
    assert state(page)["stats"]["totalReviews"]==1
    page.get_by_role("button",name="Xem chuyên đề").click()
    expect(page.locator(".chapter-card")).to_have_count(4)
    first=page.locator(".chapter-card").first
    first.locator(".lesson-button").nth(2).click()
    expect(page.locator("#study-connection")).to_be_visible()
    page.locator("#answer-input").fill(ANSWER)
    finish(page)
    page.get_by_role("button",name="Xem chuyên đề").click()
    expect(first.locator(".lesson-button").first).to_contain_text("Bài tiếp theo")
    assert state(page)["stats"]["totalReviews"]==2
    first.locator(".lesson-button").nth(3).click()
    page.locator("#answer-input").fill(ANSWER)
    assert not state(page)["learningPlan"]["synthesis"]
    finish(page)
    assert state(page)["learningPlan"]["synthesis"]["synthesis-week-1"]["score"]==4
    assert state(page)["stats"]["totalReviews"]==2
    assert 'synthesis-week-1' not in state(page)["progress"]
    nav(page,"settings")
    fixture=str(uuid4())
    page.locator("#api-key-input").fill(fixture)
    page.locator("#save-key").click()
    nav(page,"track")
    first.locator(".lesson-button").first.click()
    enter_v3(page)
    page.locator("#answer-input").fill(ANSWER)
    calls=[]
    response={"status":401}

    def provider(route):
        calls.append(route.request.url)
        assert fixture not in route.request.url
        assert route.request.headers["x-goog-api-key"]==fixture
        if response.get("offline"):
            route.abort("internetdisconnected")
        elif response.get("hold"):
            response["route"]=route
        elif "payload" in response:
            route.fulfill(json={"candidates":[{"content":{"parts":[{"text":response["payload"]}]}}]})
        else:
            route.fulfill(status=response["status"],body="{}")

    context.route("https://generativelanguage.googleapis.com/**",provider)
    grade=page.locator("#ai-grade")
    for mock,message in [
        ({"status":401},"API key"),({"status":429},"429"),({"status":503},"gặp sự cố"),
        ({"payload":"not-json"},"JSON"),({"offline":True},"Không kết nối"),({"hold":True},"22 giây"),
    ]:
        response.clear()
        response.update(mock)
        grade.click()
        expect(page.locator("#notice")).to_contain_text(message,timeout=26000 if mock.get("hold") else 5000)
        expect(grade).to_be_enabled()
        expect(page.locator("#answer-input")).to_have_value(ANSWER)
        if mock.get("hold"):
            response["route"].abort()
    response.clear()
    response["hold"]=True
    calls.clear()
    with page.expect_request("https://generativelanguage.googleapis.com/**"):
        grade.evaluate("(button) => {button.click();button.click()}")
    expect(grade).to_be_disabled()
    response["route"].fulfill(json={"candidates":[{"content":{"parts":[{"text":json.dumps(RESPONSE)}]}}]})
    expect(page.locator("#assessment-feedback")).to_have_text("<strong>Gợi ý</strong>")
    assert page.locator("#assessment-feedback strong").count()==0
    assert len(calls)==1
    assert state(page)["stats"]["totalReviews"]==2
    page.get_by_role("radio",name="4/5: Khá rõ").click()
    page.locator("#save-assessment").click()
    expect(page.locator("#completion-pane")).to_be_visible()
    assert state(page)["progress"]["geo_delta"]["lastScore"]==4
    assert state(page)["progress"]["geo_delta"]["intervalDays"]==1
    nav(page,"explore")
    response.clear()
    response["payload"]=json.dumps({"title":"Chủ đề thử của AI","question":"Một câu hỏi mới đủ dài để kiểm tra?","reference":"Đây là nội dung tham khảo đủ dài, chờ người học tự kiểm tra.",
        "checkpoints":["Ý thứ nhất","Ý thứ hai","Ý thứ ba"]})
    page.locator("#generate-topic").click()
    expect(page.locator("#ai-drafts")).to_contain_text("Chủ đề thử của AI")
    assert state(page)["customTopics"][0]["status"]=="draft"
    assert page.locator("#topic-grid .topic-card").count()==66
    nav(page,"settings")
    with page.expect_download() as event:
        page.locator("#export-data").click()
    raw=event.value.path().read_text(encoding="utf-8")
    assert fixture not in raw
    assert json.loads(raw)["data"]["learningPlan"]["synthesis"]["synthesis-week-1"]["score"]==4
    page.on("dialog",lambda dialog:dialog.accept())
    page.locator("#import-file").set_input_files({"name":"backup.json","mimeType":"application/json","buffer":raw.encode()})
    expect(page.locator("#notice")).to_contain_text("Đã khôi phục")
    assert len(state(page)["attempts"])==4
    cache=page.evaluate("""async ()=> {
        const key=(await caches.keys()).find(k=>k.startsWith('mo-mang-shell:'));
        return (await (await caches.open(key)).keys()).map(r=>new URL(r.url).pathname);
    }""")
    assert len(cache)==18 and any(path.endswith("/content/curriculum-c-28-days.json") for path in cache)
    context.set_offline(True)
    page.goto(url+"?offline=1#track")
    expect(page.locator(".chapter-card")).to_have_count(4)
    first.locator(".lesson-button").nth(1).click()
    page.locator("#answer-input").fill(ANSWER)
    finish(page)
    assert state(page)["progress"]["his_agriculture"]["lastScore"]==4
    assert not errors,errors
    print("PASS Chromium workflow: plan, SM-2, synthesis, mock API, backup, Pages subpath and offline",flush=True)
    context.close()

def migration_and_formats(browser,url):
    context=browser.new_context(accept_downloads=True)
    page=context.new_page()
    legacy={
        "version":1,"revision":3,
        "progress":{"geo_seasons":{"reps":2,"easeFactor":2.6,"intervalDays":6,"nextReview":"2033-01-07",
            "lastScore":4,"lastReviewed":"2026-01-01","history":[{"date":"2026-01-01","score":4,"feedback":"Lượt V1"}]}},
        "customTopics":[{"id":"ai_legacy01","category":"geo","title":"Chủ đề cũ","question":"Câu hỏi cũ?",
            "reference":"Giải thích cũ","checkpoints":[]}],
        "stats":{"totalReviews":1,"completedDates":["2026-01-01"]},
    }
    legacy_raw=json.dumps(legacy)
    context.add_init_script(f"""if(localStorage.getItem({json.dumps(KEY)})===null) {{
        localStorage.setItem({json.dumps(KEY)},{json.dumps(legacy_raw)});
        localStorage.setItem('mo_mang_draft_v1_geo_seasons','Nháp được giữ khi chuyển đổi');
    }}""")
    page.goto(url)
    expect(page.locator("#plan-day")).to_be_visible()
    assert state(page)["attempts"][0]["answer"] is None
    assert state(page)["drafts"]["geo_seasons"]=="Nháp được giữ khi chuyển đổi"
    assert state(page)["customTopics"][0]["id"]=="ai_legacy01"
    assert page.evaluate("key=>localStorage.getItem(key)",KEY)==legacy_raw
    page.reload()
    expect(page.locator("#plan-day")).to_be_visible()
    assert len(state(page)["attempts"])==1
    nav(page,"explore")
    page.locator("#topic-search").fill("hai bán cầu")
    page.locator(".topic-card").first.click()
    enter_v3(page)
    expect(page.locator("#answer-input")).to_have_value("Nháp được giữ khi chuyển đổi")
    page.locator("#study-form").select_option("quiz")
    page.locator("#quiz-options input").first.check()
    page.locator("#quiz-check").click()
    expect(page.locator(".quiz-reasons li")).to_have_count(4)
    page.locator("#save-assessment").click()
    expect(page.locator("#completion-pane")).to_be_visible()
    assert state(page)["progress"]["geo_seasons"]["nextReview"]=="2033-01-07"
    page.locator("#study-form").select_option("scenario")
    page.locator("#answer-input").fill("  "+ANSWER+"  ")
    finish(page)
    page.locator("#study-form").select_option("essay")
    page.locator("#answer-input").fill(ANSWER+" Đây là lần tự luận.")
    finish(page)
    saved=state(page)
    assert len(saved["attempts"])==4
    assert saved["progress"]["geo_seasons"]["nextReview"]=="2033-01-07"
    assert any(a["answer"]=="  "+ANSWER+"  " and a["mode"]=="scenario" for a in saved["attempts"])
    nav(page,"settings")
    fixture=str(uuid4())
    page.locator("#api-key-input").fill(fixture)
    page.locator("#save-key").click()
    nav(page,"explore")
    page.locator("#topic-search").fill("hai bán cầu")
    page.locator(".topic-card").first.click()
    enter_v3(page)
    page.locator("#study-form").select_option("essay")
    page.locator("#answer-input").fill(ANSWER+" Thêm ví dụ về độ dài ngày.")
    sent=[]

    def compare(route):
        sent.append(route.request.post_data_json["contents"][0]["parts"][0]["text"])
        route.fulfill(json={"candidates":[{"content":{"parts":[{"text":json.dumps(RESPONSE)}]}}]})

    context.route("https://generativelanguage.googleapis.com/**",compare)
    page.locator("#ai-grade").click()
    expect(page.locator("#analysis-details")).to_contain_text("Đã thêm ví dụ.")
    assert len(sent)==1 and "Đây là lần tự luận." in sent[0]
    assert all(a["answer"] not in sent[0] for a in saved["attempts"] if a["mode"]=="quiz")
    assert "Lượt V1" not in sent[0]
    page.get_by_role("radio",name="4/5: Khá rõ").click()
    page.locator("#save-assessment").click()
    expect(page.locator("#completion-pane")).to_be_visible()
    nav(page,"progress")
    page.locator("#history-filter").select_option("geo_seasons")
    expect(page.locator(".history-entry")).to_have_count(5)
    page.locator(".history-entry summary").last.click()
    expect(page.locator(".history-entry").last).to_contain_text("Bản cũ chưa lưu")
    nav(page,"settings")
    with page.expect_download() as event:
        page.locator("#export-data").click()
    restored=json.loads(event.value.path().read_text(encoding="utf-8"))
    assert restored["schemaVersion"]==4 and len(restored["attempts"])==5
    assert fixture not in json.dumps(restored)
    if url.startswith("http://127.0.0.1"):
        page.wait_for_function("() => Boolean(navigator.serviceWorker.controller)")
        QuietServer.test_update=True
        try:
            page.evaluate("async () => { const reg=await navigator.serviceWorker.getRegistration(); await reg.update(); }")
            page.wait_for_function("async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)")
            page.close()
            page=context.new_page()
            page.goto(url+"#progress")
            page.wait_for_function("""async () => {
                const keys=await caches.keys();
                return keys.some(key=>key.endsWith('3.1.1-test')) && !keys.some(key=>key.endsWith('3.1.0'));
            }""")
            assert len(state(page)["attempts"])==5
        finally:
            QuietServer.test_update=False
    assert page.evaluate("key=>localStorage.getItem(key)",KEY)==legacy_raw
    print("PASS IndexedDB migration, reload, all formats, raw answers, same-day scheduling and backup",flush=True)
    context.close()

def storage_denied(browser,url):
    context=browser.new_context()
    context.add_init_script("""Object.defineProperty(window, 'indexedDB', {
        get(){throw new DOMException('Denied','SecurityError');}
    });""")
    page=context.new_page()
    page.goto(url)
    expect(page.locator("#plan-day")).to_be_visible()
    page.locator("#hero-start").click()
    enter_v3(page)
    page.locator("#answer-input").fill(ANSWER)
    expect(page.locator("#draft-indicator")).to_contain_text("Nháp chỉ còn trong tab")
    expect(page.locator("#answer-input")).to_have_value(ANSWER)
    context.close()
    print("PASS IndexedDB denied: online reading and in-memory draft remain available",flush=True)


def deep_pilot(browser,url,width,status):
    context=browser.new_context(viewport={"width":width,"height":790},is_mobile=True,has_touch=True,
                                accept_downloads=True,reduced_motion="reduce")
    if browser.browser_type.name=="webkit":
        context.add_init_script("""{
            const originalFetch=window.fetch.bind(window);
            window.fetch=(url, options)=>{
                if(String(url).startsWith('https://generativelanguage.googleapis.com/')){
                    sessionStorage.setItem('mock-ai-calls',String(Number(sessionStorage.getItem('mock-ai-calls')||0)+1));
                    return Promise.resolve(new Response('{}',{status:429}));
                }
                return originalFetch(url,options);
            };
        }""")
    page=context.new_page()
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    page.goto(url)
    expect(page.locator("#plan-day")).to_be_visible()
    nav(page,"settings")
    fixture=str(uuid4())
    page.locator("#api-key-input").fill(fixture)
    page.locator("#save-key").click()
    nav(page,"home")
    expect(page.locator(".pilot-card")).to_have_count(3)
    card=page.locator(".pilot-card").nth(0 if status==200 else 1)
    card.get_by_role("button").click()
    root=page.locator("#deep-session")
    expect(root).to_contain_text("Bước 1/5")
    if status==429:
        root.locator("summary").get_by_text("Dạy tôi từ đầu").click()
        expect(root).to_contain_text("Tigris và Euphrates")
    page.locator("#deep-answer").fill(ANSWER)
    expect(page.locator("#deep-answer")).to_have_value(ANSWER)
    expect(root.get_by_role("button",name="Sang bước phản biện")).to_be_enabled()
    page.set_viewport_size({"width":width,"height":310})
    page.wait_for_function("""() => {
        const input=document.querySelector('#deep-answer'), next=input.nextElementSibling;
        return input.getBoundingClientRect().top >= visualViewport.offsetTop-1
            && next.getBoundingClientRect().bottom <= visualViewport.offsetTop+visualViewport.height+1;
    }""",timeout=5000)
    page.set_viewport_size({"width":width,"height":790})
    page.locator("#deep-answer").blur()
    expect(root.locator("[data-draft-status]")).to_have_text("Đã lưu trên thiết bị")
    location=page.url
    assert "#deep/" in location
    record_id=location.rsplit("/",1)[-1]
    def stored_initial():
        return page.evaluate("""id=>new Promise((resolve,reject)=>{
            const open=indexedDB.open('mo-mang-v3');
            open.onsuccess=()=>{
                const db=open.result;
                const request=db.transaction('learningPlans').objectStore('learningPlans').get('deep:'+id);
                request.onsuccess=()=>{db.close();resolve(request.result?.initial)};
                request.onerror=reject;
            };
            open.onerror=reject;
        })""",record_id)
    assert stored_initial()==ANSWER
    page.goto("about:blank")
    page.goto(location)
    assert stored_initial()==ANSWER
    expect(page.locator("#deep-answer")).to_have_value(ANSWER)
    page.get_by_role("button",name="Sang bước phản biện").click()
    expect(root).to_contain_text("Bước 2/5")
    calls=[]

    def provider(route):
        calls.append(route.request.url)
        assert fixture not in route.request.url
        if status==429:
            route.fulfill(status=429,body="{}")
        else:
            result={"strength":"<strong>Bạn đã nêu cơ chế.</strong>","gaps":["Cần nêu thời gian chiếu sáng."],"question":"Điều gì xảy ra sau sáu tháng?"}
            route.fulfill(json={"candidates":[{"content":{"parts":[{"text":json.dumps(result)}]}}]})

    context.route("https://generativelanguage.googleapis.com/**",provider)
    root.get_by_role("button",name="Nhờ AI phản biện").click()
    expect(root.get_by_role("button",name="Nhờ AI phản biện")).to_have_count(0)
    if status==429:
        expect(page.locator("#notice")).to_contain_text("429")
        root.get_by_role("button",name="Tự đối chiếu và viết lại").click()
    else:
        expect(root).to_contain_text("<strong>Bạn đã nêu cơ chế.</strong>")
        assert root.locator("strong").count()==0
        page.reload()
        expect(root).to_contain_text("Điều gì xảy ra sau sáu tháng?")
        root.get_by_role("button",name="Viết lại lời giải thích").click()
    if browser.browser_type.name=="webkit":
        assert page.evaluate("() => sessionStorage.getItem('mock-ai-calls')")=="1"
    else:
        assert len(calls)==1
    expect(root).to_contain_text("Bước 3/5")
    page.locator("#deep-answer").fill(ANSWER+" Bản sửa có ví dụ.")
    root.get_by_role("button",name="Sang bước vận dụng").click()
    expect(root).to_contain_text("Bước 4/5")
    page.locator("#deep-answer").fill(ANSWER+" Áp dụng cho trường hợp mới.")
    assert page.evaluate("() => innerWidth === document.documentElement.scrollWidth")
    page.locator("#deep-answer").press("Tab")
    root.get_by_role("button",name="Sang bước tổng kết").click()
    expect(root).to_contain_text("Bước 5/5")
    for check in root.get_by_role("checkbox").all():
        check.check()
    root.locator("#deep-score").select_option("5")
    expect(root.locator("[data-draft-status]")).to_have_text("Đã lưu trên thiết bị")
    if status==200:
        page.wait_for_function("() => Boolean(navigator.serviceWorker.controller)")
        context.set_offline(True)
    page.reload()
    expect(root.locator("#deep-score")).to_have_value("5")
    assert root.get_by_role("checkbox").count()==9
    root.get_by_role("button",name="Lưu phiên và lịch ôn").evaluate("(button) => {button.click();button.click()}")
    expect(root).to_contain_text("Đã lưu phiên học")
    expect(root).to_contain_text("Vận dụng được")
    assert state(page)["stats"]["totalReviews"]==1
    if status==200:
        context.set_offline(False)
    root.get_by_role("button",name="Về Hôm nay").click()
    nav(page,"progress")
    expect(page.locator("#deep-history")).to_contain_text("Vận dụng được")
    nav(page,"settings")
    with page.expect_download() as download:
        page.locator("#export-data").click()
    raw=download.value.path().read_text(encoding="utf-8")
    record=json.loads(raw)["deepSessions"][0]
    assert record["initial"]==ANSWER and record["summary"]["independent"]==(status==200)
    assert fixture not in raw
    page.on("dialog",lambda dialog:dialog.accept())
    page.locator("#import-file").set_input_files({"name":"backup.json","mimeType":"application/json","buffer":raw.encode()})
    expect(page.locator("#notice")).to_contain_text("Đã khôi phục")
    if status==200:
        nav(page,"home")
        context.set_offline(True)
        page.locator(".pilot-card").nth(2).get_by_role("button").click()
        expect(root).to_contain_text("GDP nói gì")
        page.locator("#deep-answer").fill(ANSWER)
        root.get_by_role("button",name="Sang bước phản biện").click()
        root.get_by_role("button",name="Tự đối chiếu và viết lại").click()
        page.locator("#deep-answer").fill(ANSWER+" GDP đo sản lượng trong một kỳ.")
        root.get_by_role("button",name="Sang bước vận dụng").click()
        expect(root).to_contain_text("thu nhập khả dụng trung vị")
        assert len(calls)==1
    assert not errors,errors
    context.close()
    print(f"PASS deep pilot {browser.browser_type.name} {width}px: five stages, resume, AI {status}, history and restore",flush=True)


def main(url=None):
    server=None
    if url is None:
        server=ThreadingHTTPServer(("127.0.0.1",0),partial(QuietServer,directory=str(ROOT.parent)))
        Thread(target=server.serve_forever,daemon=True).start()
        url=f"http://127.0.0.1:{server.server_port}/mo-mang-app/"
    try:
        with sync_playwright() as pw:
            for engine in (pw.chromium,pw.webkit):
                browser=engine.launch()
                for width,height in [(320,568),(360,780),(390,844),(430,932),(1366,768)]:
                    layout(browser,url,width,height)
                if engine.name=="chromium":
                    workflow(browser,url)
                    migration_and_formats(browser,url)
                    storage_denied(browser,url)
                    deep_pilot(browser,url,320,200)
                else:
                    deep_pilot(browser,url,430,429)
                browser.close()
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()


if __name__=="__main__":
    main(*sys.argv[1:])
