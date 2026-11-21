// ตรวจ ID ให้เป็นจำนวนเต็มบวกในช่วง integer ของ PostgreSQL ก่อนส่งเข้า SQL
export function parsePostgresId(value) {
    if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value)) return null;
    const id = Number(value);
    return id <= 2147483647 ? id : null;
}
