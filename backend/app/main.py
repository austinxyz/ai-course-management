from fastapi import FastAPI

from app.routers.students import router as students_router

app = FastAPI(title="学员管理系统 API")
app.include_router(students_router)
