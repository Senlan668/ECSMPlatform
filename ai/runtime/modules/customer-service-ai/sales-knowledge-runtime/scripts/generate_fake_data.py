# -*- coding: utf-8 -*-
"""
Generate fake WeChat SQLite databases for development/demo.
Creates MicroMsg.db (contacts) and Multi/MSG0.db (messages)
with 200 realistic Chinese sales course conversation messages.

Usage:
    python scripts/generate_fake_data.py [output_dir]
    # Default output: ./Msg/Msg
"""
import sqlite3
import os
import sys
import random

# Output directory
OUTPUT_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'Msg', 'Msg')

# ============================================================
# Fake contacts (Chinese names)
# ============================================================
CONTACTS = [
    {"wxid": "wxid_zhangwei01", "alias": "zhangwei_ai", "nickname": "张伟", "remark": "张伟-想学AI"},
    {"wxid": "wxid_lina02", "alias": "lina_design", "nickname": "李娜", "remark": "李娜-转行咨询"},
    {"wxid": "wxid_wangfang03", "alias": "wangfang88", "nickname": "王芳", "remark": "王芳-宝妈"},
    {"wxid": "wxid_liuyang04", "alias": "liuyang_dev", "nickname": "刘洋", "remark": "刘洋-程序员"},
    {"wxid": "wxid_chenxi05", "alias": "chenxi_pm", "nickname": "陈曦", "remark": "陈曦-产品经理"},
    {"wxid": "wxid_zhaolei06", "alias": "zhaolei_fin", "nickname": "赵磊", "remark": "赵磊-金融行业"},
    {"wxid": "wxid_sunli07", "alias": "sunli_hr", "nickname": "孙丽", "remark": "孙丽-HR转行"},
    {"wxid": "wxid_zhoujie08", "alias": "zhoujie_stu", "nickname": "周杰", "remark": "周杰-应届生"},
    {"wxid": "wxid_wumin09", "alias": "wumin_teach", "nickname": "吴敏", "remark": "吴敏-老师"},
    {"wxid": "wxid_huanghai10", "alias": "huanghai_sale", "nickname": "黄海", "remark": "黄海-销售"},
    {"wxid": "wxid_tangyan11", "alias": "tangyan_nurse", "nickname": "唐燕", "remark": "唐燕-护士转行"},
    {"wxid": "wxid_hejun12", "alias": "hejun_arch", "nickname": "何军", "remark": "何军-建筑师"},
    {"wxid": "wxid_guofei13", "alias": "guofei_media", "nickname": "郭飞", "remark": "郭飞-自媒体"},
    {"wxid": "wxid_xulei14", "alias": "xulei_driver", "nickname": "徐磊", "remark": "徐磊-司机转行"},
    {"wxid": "wxid_malin15", "alias": "malin_acct", "nickname": "马琳", "remark": "马琳-会计"},
    {"wxid": "wxid_songwei16", "alias": "songwei_grad", "nickname": "宋伟", "remark": "宋伟-研究生"},
    {"wxid": "wxid_dengxia17", "alias": "dengxia_shop", "nickname": "邓霞", "remark": "邓霞-电商运营"},
    {"wxid": "wxid_caojie18", "alias": "caojie_mech", "nickname": "曹杰", "remark": "曹杰-机械工程师"},
    {"wxid": "wxid_fengli19", "alias": "fengli_art", "nickname": "冯丽", "remark": "冯丽-美术老师"},
    {"wxid": "wxid_panyu20", "alias": "panyu_law", "nickname": "潘宇", "remark": "潘宇-律师"},
    {"wxid": "wxid_yeling21", "alias": "yeling_food", "nickname": "叶玲", "remark": "叶玲-餐饮老板"},
]

# ============================================================
# Chinese sales course conversations
# ============================================================
CONVERSATIONS = [
    # --- 初次咨询 ---
    [
        (False, "你好，我在抖音上看到你们的AI课程广告，想了解一下"),
        (True, "你好呀！感谢关注～我们这个是AI全栈实战训练营，主要教Python编程、大模型应用开发、RAG知识库搭建这些，3个月系统学习，适合零基础和想转行的同学"),
        (False, "我是做运营的，完全没有编程基础，能学会吗"),
        (True, "完全可以的！我们60%的学员都是零基础转行的，课程从Python基础开始教，而且有1对1辅导，遇到问题随时问。上期有个做HR的姐姐，3个月就拿到了AI产品经理的offer"),
        (False, "课程多少钱啊"),
        (True, "原价6980，现在新年活动价4666，包含全部课程+项目实战+就业辅导+终身回看。这个价格本周五截止哦"),
    ],
    # --- 异议处理：太贵 ---
    [
        (False, "4666还是有点贵，我看网上免费教程也挺多的"),
        (True, "理解你的顾虑～免费教程确实多，但问题是：1）内容碎片化，学完不成体系；2）没人带着做项目，遇到bug卡住就放弃了；3）没有就业指导。我们的完课率85%，免费课程一般不到5%"),
        (False, "那有没有分期付款"),
        (True, "有的！支持3期和6期免息分期，6期的话每月不到780块，一顿火锅钱就能投资自己。而且我们有7天无理由退款，试学不满意全额退"),
        (False, "好吧让我再想想"),
        (True, "没问题，不着急～我先把课程大纲和学员案例发你看看，有问题随时找我。对了活动价周五就恢复原价了，想好了尽早跟我说哈"),
    ],
    # --- 异议处理：没时间 ---
    [
        (False, "我平时上班挺忙的，996那种，怕没时间学"),
        (True, "这个我们考虑到了！课程是录播+周末直播的模式，录播随时看，不限时间。大部分学员都是上班族，每天抽1-2小时就够了，周末集中做项目"),
        (False, "那如果跟不上进度怎么办"),
        (True, "没关系的，课程终身有效，可以按自己节奏来。而且每周有答疑直播，落下的内容随时补。很多同学3个月学完，也有5-6个月慢慢学的，效果一样好"),
        (False, "直播是什么时间"),
        (True, "每周六晚上8点到10点，主要是项目实战和答疑。如果赶不上也没关系，直播都有回放，第二天就能看"),
    ],
    # --- 课程咨询 ---
    [
        (False, "你们课程具体教什么内容啊，能详细说说吗"),
        (True, "好的！课程分5个模块：\n1️⃣ Python编程基础（2周）\n2️⃣ 数据分析与机器学习（3周）\n3️⃣ 深度学习与大模型原理（3周）\n4️⃣ LLM应用开发：RAG、Agent、LangChain（3周）\n5️⃣ 全栈项目实战+就业冲刺（3周）"),
        (False, "第4个模块听起来很实用，现在企业是不是都在用RAG"),
        (True, "对！RAG现在是企业AI落地最火的方向，50%以上的AI岗位都在做RAG相关的事。我们这个模块会带你从零搭建一个完整的知识库问答系统，用的都是企业级技术栈"),
        (False, "学完能做什么样的项目"),
        (True, "你会做5个实战项目：智能客服机器人、文档问答系统、AI写作助手、数据分析平台、还有一个自选毕业项目。这些都能直接放简历里，面试的时候很加分"),
    ],
    # --- 成交转化 ---
    [
        (False, "我决定报名了，怎么付款"),
        (True, "太好了！我发你报名链接，支持微信支付、支付宝、银行卡都行。你想一次性付还是分期呀"),
        (False, "微信支付吧，一次性付"),
        (True, "好的，付款码发你了～确认收款后我马上拉你进班级群，把学习账号和资料包发给你"),
        (False, "付好了！"),
        (True, "收到啦！欢迎加入第12期训练营🎉 我已经把你拉进班级群了，你的专属导师是王老师。本周六晚8点有开营直播，记得来哦！学习资料我稍后私发你"),
    ],
    # --- 客户跟进 ---
    [
        (False, "老师你好，我上周报名的，但是还没开始学，不知道从哪里开始"),
        (True, "没问题！你先登录学习平台，从模块1第一节课开始看就行。我把直达链接发你。另外今晚8点有新生答疑直播，建议来听听，对你入门很有帮助"),
        (False, "好的谢谢！对了学完有证书吗"),
        (True, "有的！完成全部课程和毕业项目后会颁发结业证书，很多同学都放在LinkedIn和简历上了。另外优秀学员还有机会获得企业内推名额"),
        (False, "那我加油学！"),
        (True, "加油💪 有任何问题随时在群里问或者私聊我都行，我们一起努力！"),
    ],
    # --- 效果质疑 ---
    [
        (False, "你们课程学完真的能找到工作吗，我看网上说培训班出来的不好找工作"),
        (True, "这个担心很正常。实话说，光靠一纸证书确实不够，关键是你学到的真本事和做过的项目。我们课程的核心就是项目驱动，学完你手上有5个拿得出手的项目"),
        (False, "那你们往期学员就业情况怎么样"),
        (True, "上期32个学员，28个在3个月内找到了AI相关工作，就业率87%。岗位包括AI工程师、大模型开发、AI产品经理、数据分析师等。平均薪资涨幅40%左右"),
        (False, "有没有具体的学员案例"),
        (True, "有的！比如小王，之前做传统后端开发，学完后跳槽到字节做大模型应用开发，薪资从18k涨到32k。还有小李，从行政转行AI产品经理，现在在一家创业公司负责AI产品线"),
    ],
    # --- 竞品对比 ---
    [
        (False, "我也在看其他家的课程，你们跟XX教育比有什么优势"),
        (True, "好问题！主要3个差异：\n1）我们是小班制（每期30人），他们大班200+人，辅导质量不一样\n2）我们的项目是真实企业需求，不是玩具demo\n3）我们提供1年就业跟踪服务，不是学完就不管了"),
        (False, "他们价格比你们便宜一千多"),
        (True, "嗯价格确实有差异。但你可以对比一下：他们的课时、项目数量、辅导模式、就业服务。算下来我们的性价比其实更高。而且我们有7天无理由退款，零风险试学"),
        (False, "有道理，我再对比看看"),
        (True, "好的～我把我们的详细课程对比表发你，你可以逐项对比。有问题随时问我，不管最后选哪家，选适合自己的最重要"),
    ],
    # --- 年龄焦虑 ---
    [
        (False, "我今年35了，转行AI会不会太晚了"),
        (True, "一点都不晚！我们学员年龄从22到45都有。AI领域更看重解决问题的能力，你的行业经验反而是优势——你比应届生更懂业务场景，知道AI该用在哪里"),
        (False, "但是面试的时候会不会被年龄歧视"),
        (True, "AI产品经理、解决方案架构师、技术顾问这些岗位反而偏好有经验的人。不是所有AI岗位都要卷算法，应用层的机会非常多，而且薪资不低"),
        (False, "那我适合什么方向"),
        (True, "根据你的金融背景，AI+金融方向很适合你。比如智能风控、量化分析、金融知识库这些。我们课程里有金融场景的项目实战，学完直接能用"),
    ],
    # --- 学习方法咨询 ---
    [
        (False, "老师我学了一周了，感觉Python语法好多记不住怎么办"),
        (True, "很正常！刚开始不用死记语法，重要的是理解逻辑。建议你：1）跟着视频敲代码，别光看；2）每天花20分钟复习前一天的内容；3）遇到不懂的先记下来，答疑课上问"),
        (False, "我是不是太笨了，别人好像学得比我快"),
        (True, "千万别这么想！每个人基础不同，学习节奏不一样很正常。我见过很多开始慢的同学后面反而学得更扎实。坚持最重要，你已经迈出第一步了，比90%的人强"),
        (False, "谢谢老师鼓励，我继续加油"),
        (True, "加油！有问题随时问，群里的同学也很热心互相帮助。下周的项目课会很有意思，坚持到那里你会发现编程其实挺好玩的"),
    ],
    # --- 团购咨询 ---
    [
        (False, "我想和同事一起报名，有团购优惠吗"),
        (True, "有的！3人团报每人减500，5人以上团报打8折。你们几个人想一起学呀"),
        (False, "大概4-5个人，都是我们公司想转型AI的"),
        (True, "5个人的话可以享受8折优惠，每人3733元。而且我可以给你们安排同一个班级和导师，方便一起讨论学习。需要我出一份企业团购方案吗"),
        (False, "好的，你发我看看，我跟他们商量下"),
        (True, "方案发你了，里面包含课程内容、团购价格、企业发票等信息。你们商量好了随时找我，名额我先帮你们预留着"),
    ],
    # --- 退款咨询 ---
    [
        (False, "我想问下如果学了几天觉得不适合，能退款吗"),
        (True, "可以的！我们有7天无理由退款政策，报名后7天内不满意全额退款，不需要任何理由。超过7天的话第一个月内可以按比例退"),
        (False, "那我就放心了，先试试看"),
        (True, "对的，零风险试学！很多同学一开始也有顾虑，试了几天就觉得内容很实用，停不下来了哈哈。你先体验，有任何问题随时找我"),
    ],
    # --- 护士转行 ---
    [
        (False, "我是护士，工作太累了想转行，AI行业适合我吗"),
        (True, "适合的！医疗+AI现在是热门方向，比如智能导诊、病历分析、医学影像AI。你有医疗背景反而是优势，很多AI医疗公司特别需要懂业务的人"),
        (False, "但我完全不懂编程啊"),
        (True, "没关系，我们很多学员都是零基础。课程从最基础的Python开始教，而且有专门的入门衔接课。护士姐姐逻辑思维都不差的，学起来比你想象的快"),
        (False, "学完能做什么岗位"),
        (True, "AI产品经理、医疗AI运营、数据标注项目经理这些都很适合你。薪资比护士高不少，而且不用上夜班了"),
    ],
    # --- 建筑师咨询 ---
    [
        (False, "我做建筑设计的，想了解AI能不能用在我们行业"),
        (True, "太能了！AI辅助设计、智能BIM、参数化建筑这些方向现在很火。学完课程你可以开发自己的AI设计工具，在行业里会非常有竞争力"),
        (False, "需要学多久才能用到工作中"),
        (True, "基础模块2-3周学完就能用一些AI工具了。完整学完3个月，你可以自己搭建AI辅助设计的workflow，比如用AI生成方案、自动出图等"),
    ],
    # --- 自媒体博主 ---
    [
        (False, "我做自媒体的，想用AI提高内容产出效率"),
        (True, "这个太对口了！课程里有AI写作助手的项目，学完你可以搭建自己的内容生成系统。很多自媒体学员学完后产出效率翻了3倍"),
        (False, "具体能帮我做什么"),
        (True, "选题策划、文案生成、视频脚本、数据分析、粉丝画像分析这些都能用AI自动化。而且你还能把AI技能做成新的内容方向，一举两得"),
        (False, "听起来不错，有没有自媒体方向的学员案例"),
        (True, "有！小陈之前做美食博主，学完后开了AI教程账号，3个月涨粉20万。还有做知识付费的学员，用AI搭建了自动答疑系统，省了2个客服的人力成本"),
    ],
    # --- 司机转行 ---
    [
        (False, "老师我是开网约车的，学历不高，能学AI吗"),
        (True, "能学！我们有好几个学员之前也是类似背景。AI应用开发不需要特别高的学历，关键是动手能力和学习意愿。你愿意花时间学，就一定能学会"),
        (False, "我怕自己跟不上"),
        (True, "我们有专门的基础班，进度比较慢，讲得更细。而且有1对1辅导，卡住了随时问。你先试学7天，觉得跟不上全额退款，没有任何风险"),
        (False, "那我试试吧"),
        (True, "好的！我给你安排基础班，导师会特别关注你的学习进度。很多人一开始觉得难，坚持两周就上手了，加油💪"),
    ],
    # --- 会计咨询 ---
    [
        (False, "我做了8年会计，感觉这个行业要被AI取代了，想提前转型"),
        (True, "你的危机意识很好！确实基础会计工作在被自动化替代，但财务+AI的复合人才反而更值钱了。比如智能财务分析、自动化审计、财税AI助手这些方向"),
        (False, "那学完我能做什么"),
        (True, "你可以做AI财务产品经理、财税AI解决方案顾问，或者在现有公司推动AI转型。薪资比纯会计高50%以上，而且不可替代性更强"),
    ],
    # --- 研究生咨询 ---
    [
        (False, "我是计算机研究生，但方向不是AI，想补充这方面的实战能力"),
        (True, "你基础很好！对你来说重点是模块4和5——大模型应用开发和项目实战。你可以跳过前面的基础部分，直接从进阶内容开始"),
        (False, "有没有针对有基础学员的快速通道"),
        (True, "有的！我们有进阶班，跳过Python基础直接从机器学习开始，6周就能学完。而且项目难度更高，更适合你的水平"),
        (False, "价格一样吗"),
        (True, "一样的价格，但内容密度更高。而且进阶班的同学背景都比较强，讨论质量很高，对你帮助会更大"),
    ],
    # --- 电商运营 ---
    [
        (False, "我做电商运营的，想学AI来提升工作效率，有针对电商的内容吗"),
        (True, "有的！课程里有推荐系统和用户画像的项目，跟电商直接相关。学完你可以搭建智能选品系统、自动化客服、个性化推荐这些"),
        (False, "我们老板也想让团队学AI，能不能定制企业培训"),
        (True, "可以的！我们有企业定制方案，可以根据你们电商业务场景设计专属课程内容。我发你企业培训的介绍看看？"),
        (False, "好的发我"),
        (True, "发你了！里面有电商行业的AI应用案例和培训方案。你跟老板商量下，我们可以安排一次免费的需求沟通会"),
    ],
    # --- 机械工程师 ---
    [
        (False, "我是做机械设计的，感觉传统制造业越来越难了，AI能帮到我吗"),
        (True, "当然！智能制造是国家重点方向，AI+制造的人才缺口很大。比如预测性维护、质量检测AI、智能排产这些，都需要懂制造又懂AI的人"),
        (False, "我都38了，还来得及吗"),
        (True, "来得及！制造业+AI的岗位反而偏好有行业经验的人，你比应届生更懂生产线上的痛点。我们上期有个40岁的学员，之前做模具设计，现在在一家智能制造公司做AI项目经理"),
    ],
    # --- 美术老师 ---
    [
        (False, "我是美术老师，对AI绘画很感兴趣，你们课程有这方面内容吗"),
        (True, "有涉及！课程里有计算机视觉和图像生成的模块。不过如果你主要想学AI绘画（Midjourney、Stable Diffusion），我们有专门的AI创意设计短期班，2周就能上手"),
        (False, "短期班多少钱"),
        (True, "短期班1299，教你用AI辅助创作、风格迁移、图像编辑这些。很多设计师和美术老师学完后把AI融入教学，效果特别好"),
        (False, "我两个都想学，有优惠吗"),
        (True, "两个一起报的话总共减800，相当于短期班半价。而且全栈课程里的视觉模块会讲得更深入，两个互补"),
    ],
    # --- 律师咨询 ---
    [
        (False, "我是律师，想了解AI在法律行业的应用"),
        (True, "法律AI现在发展很快！合同审查、案例检索、法律文书生成这些都有成熟的AI方案了。学完课程你可以自己搭建法律知识库和智能问答系统"),
        (False, "我们律所想做一个内部的案例检索系统，课程能教这个吗"),
        (True, "完全可以！这就是RAG知识库的典型应用场景。课程模块4会手把手教你搭建，你可以直接用律所的案例数据来做毕业项目，学完就能上线用"),
        (False, "那太好了，这个对我们很实用"),
        (True, "对的，而且你做出来的系统可以给律所降本增效，老板肯定支持你学。需要的话我可以出一份给律所领导看的ROI分析"),
    ],
    # --- 餐饮老板 ---
    [
        (False, "我开了3家奶茶店，想用AI来管理运营，有什么建议吗"),
        (True, "AI在餐饮的应用很多！智能排班、销量预测、自动化营销、客户分析这些都能做。学完课程你可以搭建自己的数据分析系统，比请一个数据分析师便宜多了"),
        (False, "我不需要那么深入，有没有轻量级的方案"),
        (True, "有！你可以先学模块1和2，掌握Python和数据分析就够用了。大概4-6周的时间，就能自己写脚本分析销售数据、预测备货量这些"),
        (False, "这个实用，多少钱"),
        (True, "单独学前两个模块的话2666，但我建议你报全课程4666，因为后面的AI应用模块对你做自动化营销特别有用，性价比更高"),
    ],
]

# Additional filler messages
FILLER_MESSAGES = [
    (False, "收到，谢谢老师"),
    (True, "不客气，有问题随时找我～"),
    (False, "下一期什么时候开班"),
    (True, "下一期15号开班，目前还剩12个名额，想报名的话尽早哦"),
    (False, "课程资料能下载吗"),
    (True, "可以的，所有课件、代码、笔记都支持下载，方便离线学习"),
    (False, "有没有学习群"),
    (True, "有的！报名后会拉你进班级群，里面有同学互助、老师答疑、还有每日学习打卡"),
    (True, "同学你好～上次聊的课程考虑得怎么样了呀"),
    (False, "最近太忙了还没来得及看"),
    (True, "没关系，不着急。我把试听课链接再发你一次，有空的时候看看，体验一下教学风格"),
    (False, "好的我周末看看"),
    (True, "👌 周末愉快！看完有什么想法随时找我聊"),
    (False, "请问可以开发票吗"),
    (True, "可以的，支持个人和企业发票，报名后联系我就行"),
    (False, "老师我想问下就业辅导具体包含什么"),
    (True, "就业辅导包括：简历优化、模拟面试、岗位推荐、薪资谈判指导。我们有专门的就业老师1对1服务，直到你拿到满意的offer为止"),
]


def create_micromsg_db(output_dir: str):
    """Create MicroMsg.db with fake contacts."""
    db_path = os.path.join(output_dir, "MicroMsg.db")
    os.makedirs(output_dir, exist_ok=True)

    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE Contact (
            UserName TEXT,
            Alias TEXT,
            NickName TEXT,
            Remark TEXT,
            SmallHeadImgUrl TEXT
        )
    """)

    for c in CONTACTS:
        conn.execute(
            "INSERT INTO Contact (UserName, Alias, NickName, Remark, SmallHeadImgUrl) VALUES (?, ?, ?, ?, ?)",
            (c["wxid"], c["alias"], c["nickname"], c["remark"], None),
        )

    conn.commit()
    conn.close()
    print(f"[OK] Created {db_path} with {len(CONTACTS)} contacts")


def create_msg_db(output_dir: str, total_messages: int = 200):
    """Create Multi/MSG0.db with fake messages."""
    multi_dir = os.path.join(output_dir, "Multi")
    os.makedirs(multi_dir, exist_ok=True)
    db_path = os.path.join(multi_dir, "MSG0.db")

    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE MSG (
            localId INTEGER PRIMARY KEY,
            StrTalker TEXT,
            StrContent TEXT,
            CreateTime INTEGER,
            Type INTEGER,
            SubType INTEGER,
            IsSender INTEGER,
            DisplayContent TEXT,
            BytesExtra BLOB,
            MsgSvrID INTEGER
        )
    """)

    # Base timestamp: 2025-10-15 09:00:00 CST (well after MIN_TIMESTAMP)
    base_ts = 1760490000
    msg_id = 1
    svr_id = 9000000000000000000

    messages_generated = 0

    # First pass: ensure every contact gets at least one conversation
    for contact in CONTACTS:
        if messages_generated >= total_messages:
            break
        session_id = contact["wxid"]
        conversation = random.choice(CONVERSATIONS)
        day_offset = random.randint(0, 60) * 86400
        time_offset = random.randint(0, 43200)

        for i, (is_sender, content) in enumerate(conversation):
            if messages_generated >= total_messages:
                break
            ts = base_ts + day_offset + time_offset + (i * random.randint(30, 180))
            conn.execute(
                "INSERT INTO MSG (localId, StrTalker, StrContent, CreateTime, Type, SubType, IsSender, DisplayContent, BytesExtra, MsgSvrID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (msg_id, session_id, content, ts, 1, 0, int(is_sender), None, None, svr_id),
            )
            msg_id += 1
            svr_id += 1
            messages_generated += 1

    # Second pass: fill remaining with random conversations
    while messages_generated < total_messages:
        contact = random.choice(CONTACTS)
        session_id = contact["wxid"]
        conversation = random.choice(CONVERSATIONS)
        day_offset = random.randint(0, 60) * 86400
        time_offset = random.randint(0, 43200)

        for i, (is_sender, content) in enumerate(conversation):
            if messages_generated >= total_messages:
                break
            ts = base_ts + day_offset + time_offset + (i * random.randint(30, 180))
            conn.execute(
                "INSERT INTO MSG (localId, StrTalker, StrContent, CreateTime, Type, SubType, IsSender, DisplayContent, BytesExtra, MsgSvrID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (msg_id, session_id, content, ts, 1, 0, int(is_sender), None, None, svr_id),
            )
            msg_id += 1
            svr_id += 1
            messages_generated += 1

    # Fill remaining with filler messages
    while messages_generated < total_messages:
        contact = random.choice(CONTACTS)
        is_sender, content = random.choice(FILLER_MESSAGES)
        day_offset = random.randint(0, 60) * 86400
        ts = base_ts + day_offset + random.randint(0, 86400)

        conn.execute(
            "INSERT INTO MSG (localId, StrTalker, StrContent, CreateTime, Type, SubType, IsSender, DisplayContent, BytesExtra, MsgSvrID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (msg_id, contact["wxid"], content, ts, 1, 0, int(is_sender), None, None, svr_id),
        )
        msg_id += 1
        svr_id += 1
        messages_generated += 1

    conn.commit()
    conn.close()
    print(f"[OK] Created {db_path} with {messages_generated} messages")


def main():
    output_dir = os.path.abspath(OUTPUT_DIR)
    print(f"Generating fake WeChat data in: {output_dir}")
    print("=" * 50)

    create_micromsg_db(output_dir)
    create_msg_db(output_dir, total_messages=300)

    # Create empty MSG1-5.db
    multi_dir = os.path.join(output_dir, "Multi")
    for i in range(1, 6):
        db_path = os.path.join(multi_dir, f"MSG{i}.db")
        if not os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            conn.execute("""
                CREATE TABLE MSG (
                    localId INTEGER PRIMARY KEY,
                    StrTalker TEXT,
                    StrContent TEXT,
                    CreateTime INTEGER,
                    Type INTEGER,
                    SubType INTEGER,
                    IsSender INTEGER,
                    DisplayContent TEXT,
                    BytesExtra BLOB,
                    MsgSvrID INTEGER
                )
            """)
            conn.commit()
            conn.close()

    print("=" * 50)
    print("[DONE] Fake data ready. Run ETL:")
    print("  cd backend && uv run python scripts/run_etl.py --clear-existing")


if __name__ == "__main__":
    main()
