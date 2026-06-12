"""HR performans endpointi."""


def test_employee_performance_requires_permission(client_employee):
    r = client_employee.get("/api/hr/employee-performance")
    assert r.status_code == 403


def test_employee_performance_returns_rows(client, test_employee):
    """Çalışan listede görünmeli."""
    r = client.get("/api/hr/employee-performance")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    row = next((x for x in data if x["id"] == test_employee.id), None)
    assert row is not None, "employee performans listesinde görünmeli"
    assert row["role"] == "employee"
    assert 1 <= row["ai_score"] <= 100
    assert "full_name" in row
    assert "email" in row and "@" in row["email"]
    assert row["is_active"] is True


def test_employee_performance_excludes_platform_admin(client, test_employee, test_platform_admin):
    """Platform admin (is_platform_admin=True, tenant_id=NULL) tenant çalışan listesinde olmamalı."""
    r = client.get("/api/hr/employee-performance")
    assert r.status_code == 200
    data = r.json()
    admin_rows = [x for x in data if x["id"] == test_platform_admin.id]
    assert admin_rows == [], "platform admin tenant çalışan listesinde olmamalı"
