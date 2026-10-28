import { describe, expect, it } from 'vitest';
import { courseEntryUrl, courseHome, entryToCourse, parseCourseListHtml, parseCourseProgressHtml, progressFromText } from '../../src/platform/courses';

describe('课程列表与任务点进度解析', () => {
  it('解析课程列表中的课程名、教师和进度', () => {
    const html = `<div class="course"><a href="https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=100&clazzid=200&cpi=300">入口</a>
      <span class="course-name" title="测试课程甲">测试课程甲</span><p class="line2 color3" title="张老师">张老师</p>
      <div>已完成任务点 1/2</div></div>
      <div class="course"><a href="https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=101&clazzid=201&cpi=301">入口</a>
      <span class="course-name" title="测试课程乙">测试课程乙</span><div>已完成任务点 0/3</div></div>`;
    const entries = parseCourseListHtml(html);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: '100', classId: '200', cpi: '300', title: '测试课程甲', teacher: '张老师' });
    expect(entries[0].progress).toMatchObject({ done: 1, total: 2, percent: 50 });
    expect(entries[1].progress).toMatchObject({ done: 0, total: 3, percent: 0 });
  });
  it('解析章节页进度与进度条宽度', () => {
    const html = `<h2 class="xs_head_name">已完成任务点: <span>1</span>/19</h2><div class="catalog_ressbar_width" style="width:5%"></div>`;
    expect(parseCourseProgressHtml(html)).toMatchObject({ done: 1, total: 19, percent: 5, text: '已完成任务点 1/19' });
  });
  it('没有任务点比例时读取显式百分比', () => {
    expect(progressFromText('学习进度 37%')).toMatchObject({ percent: 37, text: '进度 37%' });
    expect(progressFromText('没有进度信息')).toBeUndefined();
  });
  it('课程主页地址包含课程与班级定位参数', () => {
    const url = new URL(courseHome('100', '200', '300'));
    expect(url.pathname).toBe('/visit/stucoursemiddle');
    expect(url.searchParams.get('courseid')).toBe('100');
    expect(url.searchParams.get('clazzid')).toBe('200');
    expect(url.searchParams.get('cpi')).toBe('300');
    expect(url.searchParams.get('ismooc2')).toBe('1'); expect(url.searchParams.get('v')).toBe('2');
    expect(entryToCourse({ id: '1', classId: '2', cpi: '3', title: '课程' }, 4)).toMatchObject({ key: '1:2', enabled: false, order: 4 });
  });
  it('旧版缺少认证参数的课程地址改走平台入口，外部地址不使用', () => {
    const course = entryToCourse({ id: '100', classId: '200', cpi: '300', title: '课程' }, 0);
    course.url = 'https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?courseid=100&clazzid=200&cpi=300';
    expect(courseEntryUrl(course)).toBe(courseHome('100', '200', '300'));
    course.url = 'https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?courseid=100&clazzid=200&enc=example';
    expect(courseEntryUrl(course)).toBe(course.url);
    course.url = 'https://example.invalid/'; expect(courseEntryUrl(course)).toBe('');
  });
});
