#!/usr/bin/env python3
"""
抓取广州实验中学公众号最新文章，保存为 news.json
由 GitHub Actions 定时调用
"""
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime

BIZ = "Mzg2Nzc1MTgyNA=="
RSS_SOURCES = [
    f"https://rsshub.app/wechat/ce/{BIZ}",
    f"https://rss.shab.fun/wechat/ce/{BIZ}",
    f"https://rsshub.rssforever.com/wechat/ce/{BIZ}",
]
MAX_ARTICLES = 6
OUTPUT = "news.json"


def fetch_rss(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_rss(xml_text):
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []
    articles = []
    for item in channel.findall("item")[:MAX_ARTICLES]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()
        desc_raw = item.findtext("description") or ""

        # 提取封面图
        thumb = ""
        m = re.search(r'<img[^>]+src="([^"]+)"', desc_raw)
        if m:
            thumb = m.group(1)

        # 清理描述
        desc = re.sub(r"<[^>]+>", "", desc_raw)
        desc = re.sub(r"\s+", " ", desc).strip()[:80]

        # 格式化日期
        date_str = ""
        if pub_date:
            try:
                d = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %z")
                date_str = d.strftime("%Y-%m-%d")
            except ValueError:
                try:
                    d = datetime.strptime(pub_date, "%Y-%m-%d %H:%M:%S")
                    date_str = d.strftime("%Y-%m-%d")
                except ValueError:
                    date_str = pub_date[:10]

        if title and link:
            articles.append({
                "title": title,
                "link": link,
                "date": date_str,
                "desc": desc,
                "thumb": thumb,
            })
    return articles


def main():
    for url in RSS_SOURCES:
        try:
            print(f"尝试: {url}")
            xml = fetch_rss(url)
            if not xml or "<error>" in xml or len(xml) < 200:
                print("  响应无效，跳过")
                continue
            articles = parse_rss(xml)
            if articles:
                print(f"  获取到 {len(articles)} 篇文章")
                with open(OUTPUT, "w", encoding="utf-8") as f:
                    json.dump({"updated": datetime.now().strftime("%Y-%m-%d %H:%M"), "articles": articles}, f, ensure_ascii=False, indent=2)
                print(f"  已保存到 {OUTPUT}")
                return 0
            else:
                print("  未解析到文章，跳过")
        except Exception as e:
            print(f"  失败: {e}")
    print("所有RSS源均失败")
    return 1


if __name__ == "__main__":
    sys.exit(main())
