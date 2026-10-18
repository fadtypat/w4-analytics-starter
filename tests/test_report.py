"""ทดสอบรายงานประจำเดือน (src/report.py)"""
import re
import subprocess
import sys

import pytest

from src import metrics as m
from src import report

ROOT = report.ROOT


@pytest.fixture(scope="module")
def df():
    return m.load_orders()


def test_march_report_net_sales(df):
    text = report.build_report("2026-03", df)
    assert "1,147,155 บาท" in text


def test_report_compares_with_previous_month(df):
    text = report.build_report("2026-03", df)
    feb = m.monthly_sales(df)["2026-02"]
    assert "เดือนก่อน (2026-02)" in text
    assert f"{feb:,.0f} บาท" in text


def test_report_top5_sorted_by_net_sales(df):
    text = report.build_report("2026-03", df)
    rows = re.findall(r"^\| (\d) \| (P\d{3}) \| .+ \| ([\d,]+) \|$", text, re.M)
    assert [r[0] for r in rows] == ["1", "2", "3", "4", "5"]
    values = [int(r[2].replace(",", "")) for r in rows]
    assert values == sorted(values, reverse=True)


def test_report_rates_match_metrics(df):
    text = report.build_report("2026-03", df)
    month = df[df["month"] == "2026-03"]
    assert f"{m.cancel_rate(month):.2f}%" in text
    assert f"{m.return_rate(df, None, '2026-03-01', '2026-03-31'):.2f}%" in text


def test_first_month_has_no_previous(df):
    assert "ไม่มีข้อมูลในไฟล์" in report.build_report("2025-10", df)


def test_invalid_month_rejected(df):
    with pytest.raises(ValueError):
        report.build_report("2026-13", df)
    with pytest.raises(ValueError):
        report.build_report("2030-01", df)


def test_cli_writes_markdown(tmp_path):
    out = tmp_path / "monthly_report.md"
    r = subprocess.run([sys.executable, "-m", "src.report", "2026-03", "--out", str(out)],
                       cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    assert "1,147,155 บาท" in out.read_text(encoding="utf-8")
