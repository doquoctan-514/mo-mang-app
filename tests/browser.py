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


class QuietServer(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.startswith("/mo-mang-app/"):
            path = f"/{ROOT.name}/" + path.removeprefix("/mo-mang-app/")
        return super().translate_path(path)

    def log_message(self, *_):
        pass


def state(page):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)


def nav(page, name):
    page.locator(f'button[data-nav="{name}"]:visible').first.click()


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
    for name in ("track", "explore", "progress", "settings", "home"):
        nav(page,name)
        dimensions=page.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})")
        assert dimensions["width"] == dimensions["scroll"], (width,name,dimensions)
    small = page.locator("button:visible").evaluate_all("buttons => buttons.filter(b=>b.offsetHeight<44||b.offsetWidth<44).map(b=>b.id||b.textContent)")
    assert not small, small
    page.locator("#hero-start").click()
    page.locator("#answer-input").focus()
    if mobile:
        page.set_viewport_size({"width":width,"height":310})
        page.wait_for_function("""() => {
            const box=document.querySelector('#answer-input').getBoundingClientRect();
            return box.top>=visualViewport.offsetTop-1 && box.bottom<=visualViewport.offsetTop+visualViewport.height+1;
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
        page.screenshot(path=out/"mo-mang-hom-nay.png",full_page=True)
        nav(page,"track")
        page.screenshot(path=out/"mo-mang-chuyen-de.png",full_page=True)
        nav(page,"home")
    due_before=page.locator("#home-due").inner_text()
    page.get_by_role("button",name="Đổi câu hỏi").click()
    topic=page.locator("#daily-card h3").inner_text()
    page.reload()
    expect(page.locator("#daily-card h3")).to_have_text(topic)
    expect(page.locator("#home-due")).to_have_text(due_before)
    page.get_by_role("button",name="Tôi muốn giải thích").click()
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
    response["route"].fulfill(json={"candidates":[{"content":{"parts":[{"text":"{\"score\":5,\"feedback\":\"<strong>Gợi ý</strong>\"}"}]}}]})
    expect(page.locator("#assessment-feedback")).to_have_text("<strong>Gợi ý</strong>")
    assert page.locator("#assessment-feedback strong").count()==0
    assert len(calls)==1
    assert state(page)["stats"]["totalReviews"]==2
    page.get_by_role("radio",name="4/5: Khá rõ").click()
    page.locator("#save-assessment").click()
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
    cache=page.evaluate("""async ()=> {
        const key=(await caches.keys()).find(k=>k.startsWith('mo-mang-shell:'));
        return (await (await caches.open(key)).keys()).map(r=>new URL(r.url).pathname);
    }""")
    assert len(cache)==12 and any(path.endswith("/content/curriculum-c-28-days.json") for path in cache)
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
                browser.close()
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()


if __name__=="__main__":
    main(*sys.argv[1:])
