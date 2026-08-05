import { notFound } from "next/navigation"; import { CourseDetail } from "@/components/CommercialPages"; import { academyCourses } from "@/data/commercial";
export default async function Page({params}:{params:Promise<{course:string}>}){const {course}=await params;if(!academyCourses.some(item=>item.slug===course))notFound();return <CourseDetail slug={course}/>}
