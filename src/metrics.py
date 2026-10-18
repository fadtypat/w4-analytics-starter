"""ฟังก์ชันคำนวณตัวชี้วัดของบ้านสบาย ช็อป

ทุกฟังก์ชันรับ DataFrame ที่ได้จาก load_orders() เป็นพารามิเตอร์แรก
นิยามตัวชี้วัดอยู่ใน CLAUDE.md
"""
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"

STATUS_OK = "จัดส่งสำเร็จ"
STATUS_CANCEL = "ยกเลิก"
STATUS_RETURN = "คืนสินค้า"


def load_orders(path: Path | str = DATA / "orders.csv") -> pd.DataFrame:
    """อ่าน orders.csv แล้วเพิ่มคอลัมน์ที่ใช้บ่อย: net, unit_cost, gp, month, date"""
    df = pd.read_csv(path, encoding="utf-8-sig")
    products = pd.read_csv(DATA / "products.csv", encoding="utf-8-sig")[["product_id", "unit_cost"]]
    df = df.merge(products, on="product_id", how="left", validate="many_to_one")
    delivered = df["status"] == STATUS_OK
    gross = df["qty"] * df["unit_price"] * (1 - df["discount_pct"] / 100)
    # แถวที่ไม่ได้จัดส่งสำเร็จไม่นับเป็นยอดขาย จึงให้ net และ gp เป็น 0
    df["net"] = gross.where(delivered, 0.0)
    df["gp"] = (gross - df["qty"] * df["unit_cost"]).where(delivered, 0.0)
    df["month"] = df["order_datetime"].str[:7]
    df["date"] = df["order_datetime"].str[:10]
    return df


def _delivered(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["status"] == STATUS_OK]


def net_sales(df: pd.DataFrame) -> float:
    """ยอดขายสุทธิรวม (บาท)"""
    return float(_delivered(df)["net"].sum())


def gross_profit(df: pd.DataFrame) -> float:
    """กำไรขั้นต้นรวม (บาท)"""
    return float(_delivered(df)["gp"].sum())


def aov(df: pd.DataFrame) -> float:
    """ยอดขายสุทธิเฉลี่ยต่อคำสั่งซื้อที่จัดส่งสำเร็จ (บาท)"""
    d = _delivered(df)
    return float(d["net"].sum() / len(d)) if len(d) else 0.0


def cancel_rate(df: pd.DataFrame) -> float:
    """อัตรายกเลิกของคำสั่งซื้อทั้งหมดใน df (เปอร์เซ็นต์ 0–100)"""
    return float((df["status"] == STATUS_CANCEL).sum() / len(df) * 100) if len(df) else 0.0


def monthly_sales(df: pd.DataFrame) -> pd.Series:
    """ยอดขายสุทธิรายเดือน index = 'YYYY-MM' เรียงตามเวลา"""
    return _delivered(df).groupby("month")["net"].sum().sort_index()


def best_month(df: pd.DataFrame) -> str:
    """เดือนที่ยอดขายสุทธิสูงสุด ('YYYY-MM')"""
    return str(monthly_sales(df).idxmax())


def channel_share(df: pd.DataFrame, channel: str, start_month: str, end_month: str) -> float:
    """สัดส่วนยอดขายสุทธิของช่องทางในช่วงเดือน start_month..end_month (รวมทั้งสองเดือน) เป็นเปอร์เซ็นต์"""
    d = _delivered(df)
    d = d[(d["month"] >= start_month) & (d["month"] <= end_month)]
    total = d["net"].sum()
    return float(d.loc[d["channel"] == channel, "net"].sum() / total * 100) if total else 0.0


_SHIP_BUCKETS = [("1-2", 1, 2), ("3-4", 3, 4), ("5-6", 5, 6), ("7+", 7, float("inf"))]


def rating_by_ship_bucket(df: pd.DataFrame) -> dict[str, float]:
    """คะแนนรีวิวเฉลี่ยตามระยะส่ง คืน dict คีย์ '1-2', '3-4', '5-6', '7+'"""
    d = df.dropna(subset=["ship_days", "rating"])
    out = {}
    for label, lo, hi in _SHIP_BUCKETS:
        r = d.loc[(d["ship_days"] >= lo) & (d["ship_days"] <= hi), "rating"]
        out[label] = float(r.mean()) if len(r) else float("nan")
    return out


def top_province(df: pd.DataFrame, region: str) -> str:
    """จังหวัดที่มียอดขายสุทธิสูงสุดในภูมิภาคที่ระบุ"""
    d = _delivered(df)
    return str(d[d["region"] == region].groupby("province")["net"].sum().idxmax())


def _between_dates(df: pd.DataFrame, start_date: str | None, end_date: str | None) -> pd.DataFrame:
    if start_date is not None:
        df = df[df["date"] >= start_date]
    if end_date is not None:
        df = df[df["date"] <= end_date]
    return df


def avg_ship_days(df: pd.DataFrame, region: str | None = None, carrier: str | None = None,
                  start_date: str | None = None, end_date: str | None = None) -> float:
    """ระยะส่งเฉลี่ย (วัน) ตามตัวกรองที่ให้มา วันที่เป็น 'YYYY-MM-DD' และรวมทั้งสองวัน"""
    d = df
    if region is not None:
        d = d[d["region"] == region]
    if carrier is not None:
        d = d[d["carrier"] == carrier]
    d = _between_dates(d, start_date, end_date).dropna(subset=["ship_days"])
    return float(d["ship_days"].mean()) if len(d) else float("nan")


def return_rate(df: pd.DataFrame, product_id: str | None = None,
                start_date: str | None = None, end_date: str | None = None) -> float:
    """อัตราคืนสินค้า (เปอร์เซ็นต์) ของสินค้าและช่วงวันที่ที่ระบุ"""
    d = df if product_id is None else df[df["product_id"] == product_id]
    d = _between_dates(d, start_date, end_date)
    return float((d["status"] == STATUS_RETURN).sum() / len(d) * 100) if len(d) else 0.0
