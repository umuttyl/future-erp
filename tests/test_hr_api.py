"""HR performans endpointi."""


def test_employee_performance_requires_permission(client_employee):
    r = client_employee.get("/api/hr/employee-performance")
    assert r.status_code == 403


def test_employee_performance_returns_rows(client, test_admin):
    r = client.get("/api/hr/employee-performance")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    row = next(x for x in data if x["id"] == test_admin.id)
    assert row["role"] == "admin"
    assert 1 <= row["ai_score"] <= 100
    assert len(row["ai_insight"]) > 5
    assert "full_name" in row
    assert "email" in row and "@" in row["email"]
    assert row["is_active"] is True
