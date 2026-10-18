"""สร้างรายงานประจำเดือนเป็น Markdown

ใช้: python -m src.report 2026-03
ได้ไฟล์ reports/monthly_report.md (เปลี่ยนที่เก็บได้ด้วย --out)

ตัวเลขทุกตัวคำนวณด้วยฟังก์ชันใน src/metrics.py เท่านั้น ที่นี่ทำแค่เลือกแถวของเดือนและจัดรูปแบบ
"""
import argparse
import calendar
import re
import sys
from pathlib import Path

import pandas as pd

from src import metrics as m

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "reports" / "monthly_report.md"
TOP_N = 5


def previous_month(month: str) -> str:
    year, mon = int(month[:4]), int(month[5:7])
    return f"{year - 1}-12" if mon == 1 else f"{year}-{mon - 1:02d}"


def _validate(month: str) -> None:
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise ValueError(f"เดือนต้องอยู่ในรูป YYYY-MM เช่น 2026-03 (ได้รับ {month!r})")


def top_products(df: pd.DataFrame, n: int = TOP_N) -> list[tuple[str, str, float]]:
    """(product_id, ชื่อสินค้า, ยอดขายสุทธิ) เรียงจากมากไปน้อย คำนวณด้วย metrics.net_sales ต่อสินค้า"""
    names = df.drop_duplicates("product_id").set_index("product_id")["product_name"]
    ranked = [(pid, names[pid], m.net_sales(df[df["product_id"] == pid])) for pid in names.index]
    ranked.sort(key=lambda r: r[2], reverse=True)
    return ranked[:n]


def build_report(month: str, df: pd.DataFrame | None = None) -> str:
    _validate(month)
    df = m.load_orders() if df is None else df
    monthly = m.monthly_sales(df)
    if month not in monthly.index:
        raise ValueError(f"ไม่พบยอดขายของเดือน {month} ในข้อมูล")
    this = df[df["month"] == month]
    last_day = calendar.monthrange(int(month[:4]), int(month[5:7]))[1]

    sales = float(monthly[month])
    prev = previous_month(month)
    lines = [f"# รายงานประจำเดือน {month}", "", "## ยอดขายสุทธิ", "",
             f"- เดือนนี้ ({month}): {sales:,.0f} บาท"]
    if prev in monthly.index:
        prev_sales = float(monthly[prev])
        diff = sales - prev_sales
        pct = f" ({diff / prev_sales * 100:+.1f}%)" if prev_sales else ""
        lines += [f"- เดือนก่อน ({prev}): {prev_sales:,.0f} บาท",
                  f"- เปลี่ยนแปลง: {diff:+,.0f} บาท{pct}"]
    else:
        lines.append(f"- เดือนก่อน ({prev}): ไม่มีข้อมูลในไฟล์")

    lines += ["", f"## {TOP_N} สินค้าขายดี (ตามยอดขายสุทธิ)", "",
              "| อันดับ | รหัสสินค้า | สินค้า | ยอดขายสุทธิ (บาท) |", "|---:|---|---|---:|"]
    for i, (pid, name, net) in enumerate(top_products(this), 1):
        lines.append(f"| {i} | {pid} | {name} | {net:,.0f} |")

    lines += ["", "## อัตรายกเลิก", "",
              f"- {m.cancel_rate(this):.2f}% ของคำสั่งซื้อทั้งหมดในเดือน",
              "", "## อัตราคืนสินค้า", "",
              f"- {m.return_rate(df, None, f'{month}-01', f'{month}-{last_day:02d}'):.2f}% ของคำสั่งซื้อทั้งหมดในเดือน",
              ""]
    return "\n".join(lines)


def write_report(month: str, out: Path | str = DEFAULT_OUT, df: pd.DataFrame | None = None) -> Path:
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build_report(month, df), encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="สร้างรายงานประจำเดือนเป็น Markdown")
    ap.add_argument("month", help="เดือนในรูป YYYY-MM เช่น 2026-03")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="ไฟล์ปลายทาง (ค่าเริ่มต้น reports/monthly_report.md)")
    args = ap.parse_args(argv)
    try:
        path = write_report(args.month, args.out)
    except ValueError as e:
        print(f"ผิดพลาด: {e}", file=sys.stderr)
        return 1
    print(f"เขียนรายงานแล้ว: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
